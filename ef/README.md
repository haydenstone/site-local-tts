# Site Local TTS

Local text-to-speech buttons for ordinary websites, with two independent engines:

- **🔊 eSpeak NG** — tiny, fast, dependable fallback.
- **🎙️ Piper** — higher-quality local neural speech.

This project deliberately bypasses the browser's native `speechSynthesis` voice provider.

## Architecture

```text
website
   │
   ├── 🔊 eSpeak
   │       │
   │       ▼
   │   localhost:8765 → espeak-ng → WAV
   │
   └── 🎙️ Piper
           │
           ▼
       localhost:8765 → cached Piper model → WAV
                                  │
                                  ▼
                            browser audio
```

The Piper model is loaded lazily and cached in the local server process, so it is not reloaded for every click.

## Install

```bash
./install.sh
```

This installs Python, a private `.venv`, eSpeak NG, and the `piper-tts` Python package.

## Add the default Piper voice

```bash
./setup-piper.sh
```

Default voice:

```text
en_US-lessac-medium
```

The model is downloaded into:

```text
models/en_US-lessac-medium.onnx
```

To choose another Piper voice:

```bash
PIPER_VOICE=en_US-amy-medium ./setup-piper.sh
```

## Start

```bash
./run.sh
```

The server binds only to:

```text
127.0.0.1:8765
```

## Check both engines

```bash
curl http://127.0.0.1:8765/health
```

You should see eSpeak availability plus Piper package/model readiness.

Test eSpeak:

```bash
curl -sS -X POST \
  --data 'Testing eSpeak.' \
  'http://127.0.0.1:8765/tts?engine=espeak' \
  -o /tmp/espeak.wav
```

Test Piper:

```bash
curl -sS -X POST \
  --data 'Testing the Piper neural voice.' \
  'http://127.0.0.1:8765/tts?engine=piper' \
  -o /tmp/piper.wav
```

## Website buttons

Each detected **logical** readable block gets:

```text
🔊  🎙️
```

- **🔊** speaks through eSpeak NG.
- **🎙️** speaks through Piper.
- While synthesizing: `⏳`
- While playing: `⏹`
- Click the active button again to stop.
- `❌` means the local request failed. Hover the button to see the error.

The button controls are removed from a cloned DOM node before text extraction, so the button glyphs themselves are not spoken.


## 1.2 injection fix

The injector now deliberately avoids the "button confetti" failure mode seen on nested chat layouts:

- chat/assistant selectors take precedence over generic article selectors,
- nested matches collapse to one logical response,
- navigation, sidebars, headers, footers, menus, dialogs, and toolbars are excluded,
- generic fallback runs only when no stronger content selector exists,
- each target is marked with `data-site-local-tts-bound="1"`,
- mutations created by the TTS controls themselves do not trigger rebinding,
- controls from an older release are cleaned before the new binding pass.

On DeepSeek this should produce one `🔊 🎙️` pair per assistant response rather than controls across the sidebar and surrounding layout.

## Client choices

### `userscript.user.js` — recommended

Install it with Tampermonkey or Violentmonkey.

The userscript uses `GM_xmlhttpRequest` when available, making it much more tolerant of sites whose Content Security Policy blocks ordinary page `fetch()` calls to localhost.

### `bookmarklet.js`

A zero-extension option. Copy the single `javascript:` line into the URL field of a browser bookmark.

Bookmarklets can be blocked by restrictive site CSP or local-network/loopback access controls.

## Piper voice configuration

The local server uses:

```text
models/en_US-lessac-medium.onnx
```

by default.

You can point it at any compatible `.onnx` Piper voice at runtime:

```bash
PIPER_MODEL=/absolute/path/to/my_voice.onnx ./run.sh
```

The companion `.onnx.json` file should remain beside the model.

### Piper speed

The server accepts `length_scale` on the Piper endpoint:

```text
/tts?engine=piper&length_scale=1.0
```

For Piper:

- lower than `1.0` = faster
- higher than `1.0` = slower

The browser clients currently use the model default (`1.0`).

## eSpeak controls

The eSpeak endpoint still supports:

```text
voice=en-us
speed=165
pitch=50
```

Example:

```text
/tts?engine=espeak&voice=en-us&speed=180&pitch=45
```

## Supported sites

This can work on most ordinary HTML sites, including chat and article layouts.

Detection includes:

```text
[data-message-author-role="assistant"]
[data-role="assistant"]
[class*="assistant"][class*="message"]
.ds-markdown
article
[role="article"]
main [class*="markdown"]
main [class*="message"]
```

If none match, the client falls back to substantial visible text blocks under `<main>`.

No generic injector can guarantee every site. Browser-internal pages, extension stores, unusual sandboxed frames, highly restrictive sites, and complex custom DOMs may require a site-specific selector or extension permission.

## DeepSeek

DeepSeek is covered by the existing generic selectors:

```text
[class*="assistant"][class*="message"]
.ds-markdown
```

No DeepSeek-only branch is required.

## API

### `GET /health`

Reports readiness of both engines.

### `POST /tts?engine=espeak`

Returns `audio/wav`.

### `POST /tts?engine=piper`

Returns `audio/wav`.

Maximum request body:

```text
50,000 bytes
```

## Security boundaries

The server:

- binds to `127.0.0.1` only,
- exposes only `/health` and `/tts`,
- has no shell-command API,
- caps input size,
- does not write submitted text to disk,
- passes eSpeak text over stdin,
- loads Piper only from the configured local model path.

## Troubleshooting Piper

### 🎙️ becomes ❌

Check:

```bash
curl http://127.0.0.1:8765/health
```

If `piper.ready` is false, run:

```bash
./install.sh
./setup-piper.sh
./run.sh
```

### First Piper click is slower

Expected. The neural model is loaded on first Piper use and then cached.

### Use a different voice

```bash
PIPER_VOICE=<voice-name> ./setup-piper.sh
PIPER_MODEL="$PWD/models/<voice-name>.onnx" ./run.sh
```

## Current Piper implementation

This repo targets the actively maintained **OHF-Voice/piper1-gpl** Python package (`piper-tts`). Piper's current documented Python API supports `PiperVoice.load(...)` and `synthesize_wav(...)`, which is what this local bridge uses.

Piper itself is GPL-3.0 licensed and is installed as an external dependency. This repository does not bundle Piper's source or binaries.

## Files

```text
site-local-tts/
├── README.md
├── LICENSE
├── .gitignore
├── install.sh
├── setup-piper.sh
├── run.sh
├── server.py
├── bookmarklet.js
└── userscript.user.js
```

## License

MIT for this repository's original code. Piper is a separate GPL-3.0 dependency.
