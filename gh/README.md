# Site Local TTS 1.3.1

Cross-site local text-to-speech for Linux browsers.

This release keeps the **inline 🔊 eSpeak / 🎙️ Piper buttons** and the **top-right Inspect / Scan controls**, but moves the localhost request into a userscript manager using `GM_xmlhttpRequest`. That avoids the page-level `connect-src` / CSP failure that made the bookmarklet work on DeepSeek but fail on ChatGPT and other sites.


## 1.3.1 CSP fix

If DevTools shows:

```text
Fetch API cannot load http://127.0.0.1:8790/...
Refused to connect because it violates the document's Content Security Policy
```

then the page-context/bookmarklet code is running.

Version 1.3.1 **never uses page `fetch()` for TTS**. It requires
`GM_xmlhttpRequest` from Tampermonkey/Violentmonkey and shows
`Transport ✗ install as userscript` if that privileged API is missing.

Install `userscript.user.js` through the userscript manager. Do not paste the
file into DevTools and do not use it as a bookmarklet.

## Architecture

```text
website DOM
   │
   ├─ automatic readable-block detection
   └─ Inspect button → click any readable block
              │
              ▼
      🔊 eSpeak / 🎙️ Piper
              │
              ▼
      userscript-manager request
              │
              ▼
       127.0.0.1:8790
          ├─ eSpeak NG
          └─ Piper neural voice
              │
              ▼
            WAV
              │
              ▼
         browser audio
```

## Files

```text
site-local-tts-userscript-v1.3.0/
├── README.md
├── install.sh
├── setup-piper.sh
├── run.sh
├── stop.sh
├── uninstall.sh
├── server.py
└── userscript.user.js
```

## 1. Install the local engine

```bash
./install.sh
```

The installer:

- detects which required Ubuntu packages already exist,
- installs only missing packages,
- records only packages it added in `.state/apt-installed-by-us`,
- creates a private `.venv`,
- installs `piper-tts` inside that venv.

It does **not** remove or replace a pre-existing system Python installation.

## 2. Install a Piper voice

```bash
./setup-piper.sh
```

Default:

```text
en_US-lessac-medium
```

To choose another voice:

```bash
PIPER_VOICE=en_US-amy-medium ./setup-piper.sh
```

## 3. Start the server

```bash
./run.sh
```

It listens only on:

```text
127.0.0.1:8790
```

Health test:

```bash
curl http://127.0.0.1:8790/health
```

## 4. Install the browser userscript

Install Tampermonkey or Violentmonkey, then install:

```text
userscript.user.js
```

The userscript requests permission only for:

```text
127.0.0.1
localhost
```

It does not use the browser's broken Linux `speechSynthesis` voice provider.

## UI

Top-right:

```text
[ 🖱 Inspect ] [ ↻ Scan ] [ ♥ Health ]  Server ✓ / status
```

Readable blocks get:

```text
🔊  🎙️
```

- **🔊** eSpeak NG
- **🎙️** Piper
- **⏳** synthesizing
- **⏹** playing, click again to stop
- **❌** request/playback failed; hover for the error

### Inspector

Click **Inspect**, hover a page element, then click it to make that element speakable.

No keyboard shortcut is installed.

## Light debugging

Browser console messages use:

```text
[Site Local TTS]
```

The top-right status reports:

- server health,
- number of auto-detected blocks,
- last engine requested,
- HTTP/request failure.

The local server logs each request to stdout.

Health response includes both engines:

```bash
curl -s http://127.0.0.1:8790/health
```

## ChatGPT

ChatGPT receives a first-class detection path based on conversation turns and assistant-role elements before generic detection is attempted.

Because audio requests go through `GM_xmlhttpRequest`, ChatGPT's page CSP does not need to permit `http://127.0.0.1:8790`.

## DeepSeek

DeepSeek selectors remain supported:

```text
.ds-markdown
[class*="assistant"][class*="message"]
```

## Other sites

The script recognizes common article, post, comment, response, message, markdown and content containers. If automatic detection misses a page, use **Inspect** and click the exact readable block.

Open Shadow DOM roots are also scanned.

No browser script can operate on protected browser-internal pages such as `chrome://...`, extension stores, or inaccessible closed/sandboxed frames.

## Stop server

```bash
./stop.sh
```

## Uninstall

Normal uninstall:

```bash
./uninstall.sh
```

This:

- stops the local server if this project started it,
- removes `.venv`,
- removes downloaded Piper models,
- removes project runtime/state/log files,
- removes only APT packages recorded as installed by this installer.

The source directory is deliberately preserved so `uninstall.sh` and your source remain recoverable.

To remove **everything including this extracted source directory**:

```bash
./uninstall.sh --purge
```

The userscript itself must also be removed from Tampermonkey/Violentmonkey because browser extensions manage their own script storage.

## Security

The server:

- binds to loopback only,
- exposes only `/health` and `/tts`,
- caps text requests at 50 KB,
- has no arbitrary command endpoint,
- never accepts a shell command from a webpage,
- feeds eSpeak through stdin,
- loads Piper only from a configured local model path.

## Version

`1.3.1` — privileged transport is now mandatory; there is no page-fetch fallback.
