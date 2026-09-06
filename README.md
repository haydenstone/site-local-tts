# Site Local TTS

A small local text-to-speech bridge for Linux browsers that avoids the browser's native `speechSynthesis` voice stack entirely.

It was built after diagnosing a Chromium/Linux failure where:

- page text extraction worked,
- Web Audio worked,
- `speechSynthesis` existed,
- `SpeechSynthesisUtterance` existed,
- `speechSynthesis.getVoices()` stayed empty,
- `voiceschanged` never fired,
- every utterance failed at character `0` with `synthesis-failed`.

Instead of fighting the browser's voice provider, this project uses a simpler path:

```text
website text
   │
   ▼
inline 🔊 button
   │
   ▼
localhost:8765
   │
   ▼
eSpeak NG
   │
   ▼
WAV audio
   │
   ▼
browser <audio>
```

## Can it work on all sites?

**Most ordinary sites: yes. Literally every site: no.**

There are two client modes:

1. **Bookmarklet** — zero extension install, but it runs inside the page's security context. A site's Content Security Policy can block `fetch()` to `127.0.0.1`, and browsers may require explicit permission before an HTTPS page can access loopback/local-network services.
2. **Userscript (recommended)** — intended for Tampermonkey/Violentmonkey/Greasemonkey-style managers. It uses an extension-provided cross-origin request API when available, which is more reliable on restrictive sites.

Some special browser surfaces cannot be scripted by ordinary extensions/bookmarklets, including browser settings pages, some extension stores, PDF viewers, sandboxed cross-origin frames, and pages where the extension itself is denied access.

## Requirements

- Linux
- Python 3
- `espeak-ng`
- A modern browser
- Optional but recommended: Tampermonkey or Violentmonkey

## Install

```bash
./install.sh
```

Or manually:

```bash
sudo apt update
sudo apt install -y python3 espeak-ng
```

## Start the local TTS server

```bash
./run.sh
```

The server listens only on:

```text
127.0.0.1:8765
```

It is intentionally not exposed to your LAN.

Quick health check:

```bash
curl http://127.0.0.1:8765/health
```

Expected response:

```json
{"ok": true, "engine": "espeak-ng"}
```

## Option A: Userscript, recommended

Open:

```text
userscript.user.js
```

Install it in Tampermonkey/Violentmonkey/Greasemonkey.

The script scans likely article/chat/message blocks and inserts a small inline:

```text
🔊
```

button directly into the page.

Click once to speak that block. Click the active button again to stop.

### Why the userscript is preferred

A normal page `fetch()` is controlled by the site's `Content-Security-Policy: connect-src`. The userscript version uses `GM_xmlhttpRequest` when available, so its request is made through the userscript manager rather than ordinary page `fetch()`.

## Option B: Bookmarklet

Open:

```text
bookmarklet.js
```

Copy the single `javascript:` line into the URL field of a browser bookmark.

Visit a page and click the bookmark.

The script injects inline 🔊 buttons into likely readable content blocks.

### Loopback permission

Modern browsers may ask whether the current website can access a service on your local device. Allow loopback/local-network access for the page if you want the bookmarklet to reach:

```text
http://127.0.0.1:8765
```

The bookmarklet also sets `targetAddressSpace: "loopback"` where the browser supports it.

## Generic content detection

The client tries several common content shapes:

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

If none match, it falls back to substantial visible text containers inside `<main>`.

This is deliberately heuristic. For a site with an unusual DOM, edit the `SELECTORS` list in either client.

## DeepSeek

DeepSeek is already covered by:

```text
[class*="assistant"][class*="message"]
.ds-markdown
```

so no DeepSeek-specific fork is required.

## Server API

### `GET /health`

Returns basic server health.

### `POST /tts`

Body: UTF-8 plain text.

Optional query parameters:

```text
voice=en-us
speed=165
pitch=50
```

Example:

```bash
curl -sS \
  -X POST \
  --data 'Hello from local TTS.' \
  'http://127.0.0.1:8765/tts?voice=en-us&speed=165' \
  -o /tmp/test.wav
```

Then play `/tmp/test.wav` using your normal audio player.

## Safety boundaries

The server:

- binds to loopback only,
- accepts only `/health` and `/tts`,
- does not execute page-provided shell commands,
- caps text input size,
- passes text to `espeak-ng` over stdin,
- validates numeric voice parameters,
- does not write user text to disk,
- does not require root after package installation.

## Troubleshooting

### Button shows ❌

First confirm the server is running:

```bash
curl http://127.0.0.1:8765/health
```

If that works but the bookmarklet fails, the site/browser is probably blocking the page-to-loopback request. Use the userscript instead.

### Browser asks for local network permission

Allow it if you want that origin to use the local TTS server.

### No buttons appear

Run this in DevTools:

```javascript
document.querySelectorAll('article,[role="article"],.ds-markdown,[class*="message"]').length
```

If it returns `0`, add an appropriate selector to `SELECTORS`.

### eSpeak itself is silent

Test directly:

```bash
espeak-ng "Local speech engine test."
```

If that is silent too, fix the OS audio path first.

## Files

```text
site-local-tts/
├── README.md
├── LICENSE
├── .gitignore
├── install.sh
├── run.sh
├── server.py
├── bookmarklet.js
└── userscript.user.js
```

## References

- MDN: Local network access
  https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Local_network_access
- MDN: CSP `connect-src`
  https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/connect-src
- MDN: `Request.targetAddressSpace`
  https://developer.mozilla.org/en-US/docs/Web/API/Request/targetAddressSpace

## License

MIT
