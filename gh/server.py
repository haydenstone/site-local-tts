#!/usr/bin/env python3
from __future__ import annotations

import io
import json
import os
import shutil
import subprocess
import sys
import threading
import urllib.parse
import wave
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

HOST = "127.0.0.1"
PORT = int(os.environ.get("SITE_LOCAL_TTS_PORT", "8790"))
MAX_TEXT_BYTES = 50_000

ROOT = Path(__file__).resolve().parent
DEFAULT_PIPER_MODEL = ROOT / "models" / "en_US-lessac-medium.onnx"
PIPER_MODEL = Path(os.environ.get("PIPER_MODEL", str(DEFAULT_PIPER_MODEL)))
PIDFILE = Path(os.environ.get("SITE_LOCAL_TTS_PIDFILE", str(ROOT / ".state" / "server.pid")))

_PIPER_VOICE = None
_PIPER_LOCK = threading.Lock()

try:
    from piper import PiperVoice, SynthesisConfig
    PIPER_IMPORT_OK = True
    PIPER_IMPORT_ERROR = None
except Exception as exc:
    PiperVoice = None
    SynthesisConfig = None
    PIPER_IMPORT_OK = False
    PIPER_IMPORT_ERROR = f"{type(exc).__name__}: {exc}"


def log(message: str) -> None:
    print(f"[site-local-tts] {message}", flush=True)


def clamp_int(value: str | None, default: int, lo: int, hi: int) -> int:
    try:
        n = int(value) if value is not None else default
    except (TypeError, ValueError):
        return default
    return max(lo, min(hi, n))


def clamp_float(value: str | None, default: float, lo: float, hi: float) -> float:
    try:
        n = float(value) if value is not None else default
    except (TypeError, ValueError):
        return default
    return max(lo, min(hi, n))


def safe_espeak_voice(value: str | None) -> str:
    if not value:
        return "en-us"
    allowed = "".join(ch for ch in value if ch.isalnum() or ch in "-_+")
    return allowed[:40] or "en-us"


def piper_status() -> dict:
    return {
        "import_ok": PIPER_IMPORT_OK,
        "model": str(PIPER_MODEL),
        "model_exists": PIPER_MODEL.is_file(),
        "ready": bool(PIPER_IMPORT_OK and PIPER_MODEL.is_file()),
        "import_error": PIPER_IMPORT_ERROR,
    }


def get_piper_voice():
    global _PIPER_VOICE
    if not PIPER_IMPORT_OK:
        raise RuntimeError(f"Piper unavailable: {PIPER_IMPORT_ERROR}")
    if not PIPER_MODEL.is_file():
        raise RuntimeError(f"Piper model missing: {PIPER_MODEL}; run ./setup-piper.sh")

    if _PIPER_VOICE is None:
        with _PIPER_LOCK:
            if _PIPER_VOICE is None:
                log(f"loading Piper model: {PIPER_MODEL}")
                _PIPER_VOICE = PiperVoice.load(str(PIPER_MODEL))
                log("Piper model loaded")
    return _PIPER_VOICE


def synth_espeak(raw: bytes, query: dict[str, list[str]]) -> bytes:
    if not shutil.which("espeak-ng"):
        raise RuntimeError("espeak-ng not found")

    voice = safe_espeak_voice(query.get("voice", ["en-us"])[0])
    speed = clamp_int(query.get("speed", ["165"])[0], 165, 80, 450)
    pitch = clamp_int(query.get("pitch", ["50"])[0], 50, 0, 99)

    proc = subprocess.run(
        [
            "espeak-ng", "--stdout", "--stdin",
            "-v", voice,
            "-s", str(speed),
            "-p", str(pitch),
        ],
        input=raw,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=30,
        check=False,
    )

    if proc.returncode != 0:
        raise RuntimeError(
            (proc.stderr or b"espeak-ng failed").decode("utf-8", "replace")[:4096]
        )
    return proc.stdout


def synth_piper(text: str, query: dict[str, list[str]]) -> bytes:
    voice = get_piper_voice()
    length_scale = clamp_float(
        query.get("length_scale", ["1.0"])[0], 1.0, 0.25, 4.0
    )
    syn_config = SynthesisConfig(length_scale=length_scale)

    with io.BytesIO() as wav_io:
        with wave.open(wav_io, "wb") as wav_file:
            voice.synthesize_wav(text, wav_file, syn_config=syn_config)
        return wav_io.getvalue()


class Handler(BaseHTTPRequestHandler):
    server_version = "SiteLocalTTS/1.3.0"

    def cors(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Private-Network", "true")
        self.send_header("Cache-Control", "no-store")

    def send_bytes(self, status: int, body: bytes, content_type: str) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.cors()
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.cors()
        self.end_headers()

    def do_GET(self) -> None:
        path = urllib.parse.urlsplit(self.path).path
        if path != "/health":
            self.send_bytes(404, b"not found\n", "text/plain; charset=utf-8")
            return

        body = json.dumps(
            {
                "ok": True,
                "version": "1.3.0",
                "pid": os.getpid(),
                "engines": {
                    "espeak": {
                        "ready": bool(shutil.which("espeak-ng")),
                        "binary": shutil.which("espeak-ng"),
                    },
                    "piper": piper_status(),
                },
            },
            indent=2,
        ).encode()
        self.send_bytes(200, body, "application/json")

    def do_POST(self) -> None:
        parsed = urllib.parse.urlsplit(self.path)
        if parsed.path != "/tts":
            self.send_bytes(404, b"not found\n", "text/plain; charset=utf-8")
            return

        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            length = 0

        if length <= 0:
            self.send_bytes(400, b"empty body\n", "text/plain; charset=utf-8")
            return

        if length > MAX_TEXT_BYTES:
            self.send_bytes(413, b"text too large\n", "text/plain; charset=utf-8")
            return

        raw = self.rfile.read(length)
        if not raw.strip():
            self.send_bytes(400, b"empty text\n", "text/plain; charset=utf-8")
            return

        query = urllib.parse.parse_qs(parsed.query)
        engine = query.get("engine", ["espeak"])[0].lower()
        log(f"request engine={engine} bytes={len(raw)} from={self.client_address[0]}")

        try:
            if engine == "espeak":
                wav = synth_espeak(raw, query)
            elif engine == "piper":
                wav = synth_piper(raw.decode("utf-8", "replace"), query)
            else:
                raise RuntimeError(f"unknown engine: {engine}")
        except Exception as exc:
            log(f"ERROR engine={engine}: {type(exc).__name__}: {exc}")
            body = f"{type(exc).__name__}: {exc}\n".encode()
            self.send_bytes(503, body[:8192], "text/plain; charset=utf-8")
            return

        log(f"response engine={engine} wav_bytes={len(wav)}")
        self.send_bytes(200, wav, "audio/wav")

    def log_message(self, fmt: str, *args) -> None:
        log(fmt % args)


def main() -> int:
    PIDFILE.parent.mkdir(parents=True, exist_ok=True)
    PIDFILE.write_text(str(os.getpid()) + "\n")

    log(f"version=1.3.0 listening=http://{HOST}:{PORT}")
    log(f"espeak={'ready' if shutil.which('espeak-ng') else 'missing'}")
    ps = piper_status()
    log(
        "piper=" +
        ("ready" if ps["ready"] else
         f"not-ready import_ok={ps['import_ok']} model_exists={ps['model_exists']}")
    )

    server = ThreadingHTTPServer((HOST, PORT), Handler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
        try:
            if PIDFILE.exists() and PIDFILE.read_text().strip() == str(os.getpid()):
                PIDFILE.unlink()
        except Exception:
            pass
        log("stopped")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
