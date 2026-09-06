#!/usr/bin/env python3
from __future__ import annotations

import json
import shutil
import subprocess
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HOST = "127.0.0.1"
PORT = 8765
MAX_TEXT_BYTES = 50_000

if not shutil.which("espeak-ng"):
    raise SystemExit("ERROR: espeak-ng not found. Run ./install.sh first.")


def clamp_int(value: str | None, default: int, lo: int, hi: int) -> int:
    try:
        n = int(value) if value is not None else default
    except (TypeError, ValueError):
        return default
    return max(lo, min(hi, n))


def safe_voice(value: str | None) -> str:
    if not value:
        return "en-us"
    allowed = "".join(ch for ch in value if ch.isalnum() or ch in "-_+")
    return allowed[:40] or "en-us"


class Handler(BaseHTTPRequestHandler):
    server_version = "SiteLocalTTS/1.0"

    def cors(self) -> None:
        # Browser-side access is deliberately permissive, but the service only
        # binds to 127.0.0.1 and exposes no filesystem or command endpoint.
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
        body = json.dumps({"ok": True, "engine": "espeak-ng"}).encode()
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

        text = self.rfile.read(length)
        if not text.strip():
            self.send_bytes(400, b"empty text\n", "text/plain; charset=utf-8")
            return

        params = urllib.parse.parse_qs(parsed.query)
        voice = safe_voice(params.get("voice", ["en-us"])[0])
        speed = clamp_int(params.get("speed", ["165"])[0], 165, 80, 450)
        pitch = clamp_int(params.get("pitch", ["50"])[0], 50, 0, 99)

        cmd = [
            "espeak-ng",
            "--stdout",
            "--stdin",
            "-v", voice,
            "-s", str(speed),
            "-p", str(pitch),
        ]

        proc = subprocess.run(
            cmd,
            input=text,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=30,
            check=False,
        )

        if proc.returncode != 0:
            msg = proc.stderr or b"espeak-ng failed\n"
            self.send_bytes(500, msg[:4096], "text/plain; charset=utf-8")
            return

        self.send_bytes(200, proc.stdout, "audio/wav")

    def log_message(self, fmt: str, *args) -> None:
        print("[site-local-tts]", fmt % args)


if __name__ == "__main__":
    print(f"Site Local TTS listening on http://{HOST}:{PORT}")
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
