// ==UserScript==
// @name         Site Local TTS — Inspector + eSpeak + Piper
// @namespace    local.site.tts
// @version      1.3.1
// @description  Cross-site inline TTS with inspector, eSpeak NG and Piper via localhost.
// @match        http://*/*
// @match        https://*/*
// @grant        GM_xmlhttpRequest
// @connect      127.0.0.1
// @connect      localhost
// @run-at       document-idle
// @inject-into   content
// ==/UserScript==

(() => {
  "use strict";

  const PREFIX = "[Site Local TTS]";
  const BASE = "http://127.0.0.1:8790";
  const CHATGPT = /(^|\.)chatgpt\.com$/i.test(location.hostname);

  if (window.__SITE_LOCAL_TTS_USER__) {
    console.debug(PREFIX, "already loaded");
    return;
  }

  const S = {
    audio: null,
    button: null,
    inspect: false,
    hover: null,
    observer: null,
    bound: new WeakSet(),
    candidates: new Set(),
    timer: null,
    lastObjectUrl: null,
  };

  window.__SITE_LOCAL_TTS_USER__ = S;

  const UI =
    'nav,aside,header,footer,form,[role="navigation"],[role="menu"],' +
    '[role="dialog"],[role="toolbar"],[aria-hidden="true"],' +
    'script,style,template,noscript';

  const GENERIC = [
    '[data-message-author-role="assistant"]',
    '[data-role="assistant"]',
    '[class*="assistant"][class*="message"]',
    '.ds-markdown',
    '[class*="answer"]',
    '[class*="response"]',
    '[class*="message"]',
    '[class*="comment"]',
    '[class*="post"]',
    'article',
    '[role="article"]'
  ];

  const log = (...args) => console.debug(PREFIX, ...args);
  const error = (...args) => console.error(PREFIX, ...args);

  const PRIVILEGED_TRANSPORT = typeof GM_xmlhttpRequest === "function";

  const roots = () => {
    const out = [document];
    const walk = root => {
      if (!root?.querySelectorAll) return;
      root.querySelectorAll("*").forEach(el => {
        if (el.shadowRoot) {
          out.push(el.shadowRoot);
          walk(el.shadowRoot);
        }
      });
    };
    walk(document);
    return out;
  };

  const qsa = selector =>
    roots().flatMap(root => {
      try {
        return [...root.querySelectorAll(selector)];
      } catch {
        return [];
      }
    });

  const text = el => {
    const clone = el.cloneNode(true);
    clone.querySelectorAll?.(
      ".site-local-tts-controls,#site-local-tts-inspector,#site-local-tts-tip," +
      "button,[role='button'],svg"
    ).forEach(x => x.remove());

    return String(clone.innerText || clone.textContent || "")
      .replace(/\s+/g, " ")
      .trim();
  };

  const visible = el => {
    if (!el || el.closest?.(UI)) return false;

    const r = el.getBoundingClientRect?.();
    if (!r || r.width < 80 || r.height < 20) return false;

    const cs = getComputedStyle(el);
    return cs.display !== "none" &&
      cs.visibility !== "hidden" &&
      cs.opacity !== "0";
  };

  const logical = list => {
    const out = [];

    for (const el of list) {
      if (!visible(el)) continue;

      const t = text(el);
      if (t.length < 20 || t.length > 50000) continue;

      if (out.some(x =>
        x === el || x.contains(el) || el.contains(x)
      )) continue;

      out.push(el);
    }

    return out;
  };

  const chatGptCandidates = () => {
    const direct = logical(qsa('[data-message-author-role="assistant"]'));
    if (direct.length) return direct;

    const turns = qsa(
      'article[data-testid^="conversation-turn-"],' +
      '[data-testid^="conversation-turn-"]'
    );

    const out = [];
    for (const turn of turns) {
      const el =
        turn.querySelector?.('[data-message-author-role="assistant"]') ||
        turn.querySelector?.('.markdown,[class*="markdown"]');

      if (el && visible(el) && text(el).length >= 20) out.push(el);
    }

    return logical(out);
  };

  const genericCandidates = () => {
    for (const selector of GENERIC) {
      const found = logical(qsa(selector));
      if (found.length) return found;
    }

    const semantic = logical(qsa(
      'main article,main section,main [role="article"],' +
      'main [class*="content"],main [class*="markdown"],main [class*="text"]'
    ));

    if (semantic.length) return semantic;

    return logical(
      qsa("main div,main section,article,section").filter(el => {
        if (!visible(el)) return false;

        const t = text(el);
        if (t.length < 120 || t.length > 30000) return false;

        const kids = [...el.children]
          .filter(c => text(c).length > 100).length;

        const interactive =
          el.querySelectorAll?.("button,input,textarea,select,a").length || 0;

        return kids <= 3 && interactive <= 12;
      })
    ).slice(0, 60);
  };

  const candidates = () =>
    CHATGPT ? chatGptCandidates() : genericCandidates();

  let panel, state, inspectButton, tip;

  const setStatus = (message, bad = false) => {
    if (!state) return;
    state.textContent = message;
    state.style.color = bad ? "#fca5a5" : "";
    state.title = message;
  };

  const gmRequest = options => new Promise((resolve, reject) => {
    if (typeof GM_xmlhttpRequest !== "function") {
      reject(new Error(
        "GM_xmlhttpRequest is unavailable. Install this file as a Tampermonkey/Violentmonkey userscript; do not run it as a bookmarklet or DevTools snippet."
      ));
      return;
    }

    GM_xmlhttpRequest({
      ...options,
      timeout: options.timeout ?? 30000,
      onload: resolve,
      ontimeout: () => reject(new Error("localhost request timed out")),
      onerror: event => reject(new Error(
        "privileged localhost request failed" +
        (event?.error ? `: ${event.error}` : "")
      )),
      onabort: () => reject(new Error("localhost request aborted")),
    });
  });

  const health = async () => {
    setStatus("Checking…");
    try {
      const r = await gmRequest({
        method: "GET",
        url: `${BASE}/health`,
        responseType: "json",
        timeout: 3000,
      });

      if (r.status < 200 || r.status >= 300) {
        throw new Error(`health HTTP ${r.status}`);
      }

      const body =
        typeof r.response === "object"
          ? r.response
          : JSON.parse(r.responseText || "{}");

      const e = body?.engines?.espeak?.ready ? "eSpeak✓" : "eSpeak✗";
      const p = body?.engines?.piper?.ready ? "Piper✓" : "Piper✗";
      setStatus(`Server ✓ ${e} ${p}`);
      log("health", body);
      return body;
    } catch (exc) {
      setStatus(`Server ✗ ${exc.message}`, true);
      error("health failed", exc);
      return null;
    }
  };

  const stop = () => {
    if (S.audio) {
      S.audio.pause();
      S.audio.src = "";
      S.audio = null;
    }

    if (S.lastObjectUrl) {
      URL.revokeObjectURL(S.lastObjectUrl);
      S.lastObjectUrl = null;
    }

    if (S.button) S.button.textContent = S.button.dataset.icon;
    S.button = null;
  };

  const speak = async (el, button, engine) => {
    if (S.button === button && S.audio) {
      stop();
      setStatus("Stopped");
      return;
    }

    stop();
    button.textContent = "⏳";
    S.button = button;

    const body = text(el);
    if (!body) {
      button.textContent = "❌";
      setStatus("No readable text", true);
      return;
    }

    setStatus(`${engine}: ${body.length} chars`);
    log("request", {engine, chars: body.length, host: location.hostname});

    try {
      const response = await gmRequest({
        method: "POST",
        url: `${BASE}/tts?engine=${encodeURIComponent(engine)}`,
        headers: {"Content-Type": "text/plain;charset=UTF-8"},
        data: body,
        responseType: "blob",
        timeout: 60000,
      });

      if (response.status < 200 || response.status >= 300) {
        const detail =
          response.responseText ||
          `TTS HTTP ${response.status}`;
        throw new Error(String(detail).trim());
      }

      const blob = response.response;
      if (!(blob instanceof Blob) || !blob.size) {
        throw new Error("TTS returned an empty/non-Blob response");
      }

      const url = URL.createObjectURL(blob);
      S.lastObjectUrl = url;

      const audio = new Audio(url);
      S.audio = audio;
      button.textContent = "⏹";

      audio.onplay = () => {
        setStatus(`${engine} ▶`);
        log("audio play", {engine, bytes: blob.size});
      };

      audio.onended = () => {
        setStatus(`${engine} ✓`);
        stop();
      };

      audio.onerror = () => {
        const mediaError = audio.error?.message || `code ${audio.error?.code || "?"}`;
        button.textContent = "❌";
        button.title = `Audio playback failed: ${mediaError}`;
        setStatus(`Audio ✗ ${mediaError}`, true);
        error("audio playback failed", mediaError);
        stop();
      };

      await audio.play();
    } catch (exc) {
      error("speak failed", {engine, error: exc});
      button.textContent = "❌";
      button.title = exc.message || String(exc);
      setStatus(`${engine} ✗ ${exc.message || exc}`, true);
      S.audio = null;
      S.button = null;
    }
  };

  const makeButton = (icon, label, engine, el) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = icon;
    button.dataset.icon = icon;
    button.title = label;
    button.setAttribute("aria-label", label);

    button.style.cssText =
      "margin:0 3px;padding:2px 7px;border:1px solid #7776;" +
      "border-radius:6px;background:transparent;color:inherit;" +
      "cursor:pointer;font:14px system-ui;line-height:1.4;vertical-align:middle";

    button.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      speak(el, button, engine);
    });

    return button;
  };

  const bind = el => {
    if (!el || !visible(el) || text(el).length < 1 || S.bound.has(el)) return;

    el.querySelectorAll?.(":scope>.site-local-tts-controls")
      .forEach(x => x.remove());

    const controls = document.createElement("span");
    controls.className = "site-local-tts-controls";
    controls.style.cssText =
      "display:inline-flex;align-items:center;gap:2px;margin:4px 6px 4px 0;" +
      "position:relative;z-index:2147483645";

    controls.append(
      makeButton("🔊", "Read with eSpeak NG", "espeak", el),
      makeButton("🎙️", "Read with Piper", "piper", el)
    );

    try {
      el.prepend(controls);
      S.bound.add(el);
    } catch (exc) {
      error("bind failed", exc);
    }
  };

  const scan = () => {
    const found = candidates();
    S.candidates = new Set(found);
    found.forEach(bind);
    setStatus(`${found.length} speakable`);
    log("scan", {count: found.length, chatgpt: CHATGPT});
  };

  panel = document.createElement("div");
  panel.id = "site-local-tts-inspector";
  panel.style.cssText =
    "position:fixed;top:10px;right:10px;z-index:2147483647;" +
    "display:flex;align-items:center;gap:6px;padding:6px 8px;" +
    "border:1px solid #4b5563;border-radius:9px;background:#111827;" +
    "color:#fff;font:12px system-ui;box-shadow:0 8px 28px #0008";

  panel.innerHTML =
    '<button id="slti-inspect" type="button" style="cursor:pointer;padding:4px 8px;border:1px solid #64748b;border-radius:6px;background:#1f2937;color:#fff">🖱 Inspect</button>' +
    '<button id="slti-scan" type="button" style="cursor:pointer;padding:4px 8px;border:1px solid #64748b;border-radius:6px;background:#1f2937;color:#fff">↻ Scan</button>' +
    '<button id="slti-health" type="button" style="cursor:pointer;padding:4px 8px;border:1px solid #64748b;border-radius:6px;background:#1f2937;color:#fff">♥ Health</button>' +
    '<span id="slti-state" style="opacity:.85">Starting…</span>';

  document.body.appendChild(panel);

  state = panel.querySelector("#slti-state");
  inspectButton = panel.querySelector("#slti-inspect");

  if (!PRIVILEGED_TRANSPORT) {
    state.textContent = "Transport ✗ install as userscript";
    state.style.color = "#fca5a5";
    console.error(
      PREFIX,
      "GM_xmlhttpRequest missing. This code must be installed in Tampermonkey/Violentmonkey, not pasted into the page or run as a bookmarklet."
    );
  }

  tip = document.createElement("div");
  tip.id = "site-local-tts-tip";
  tip.style.cssText =
    "position:fixed;z-index:2147483647;display:none;pointer-events:none;" +
    "max-width:520px;padding:7px 9px;border:1px solid #60a5fa;" +
    "border-radius:7px;background:#0b1220;color:#e5e7eb;" +
    "font:11px ui-monospace,monospace;box-shadow:0 8px 28px #0008;" +
    "white-space:pre-wrap";

  document.body.appendChild(tip);

  const clearHover = () => {
    if (S.hover) {
      S.hover.style.outline = S.hover.dataset.sltiOldOutline || "";
      delete S.hover.dataset.sltiOldOutline;
      S.hover = null;
    }
    tip.style.display = "none";
  };

  const toggleInspector = () => {
    S.inspect = !S.inspect;
    inspectButton.textContent = S.inspect ? "🟢 Inspecting" : "🖱 Inspect";
    document.documentElement.style.cursor = S.inspect ? "crosshair" : "";
    setStatus(S.inspect ? "Hover, click to bind" : "Ready");
    if (!S.inspect) clearHover();
  };

  const elementName = el => {
    let name = (el.tagName || "node").toLowerCase();
    if (el.id) name += `#${el.id}`;
    else if (el.classList?.length) {
      name += "." + [...el.classList].slice(0, 4).join(".");
    }
    return name;
  };

  const hover = event => {
    if (!S.inspect) return;

    const el = event.target;
    if (el.closest?.("#site-local-tts-inspector,.site-local-tts-controls")) return;

    clearHover();

    const auto = S.candidates.has(el);
    const excluded = !!el.closest?.(UI);
    const ok = visible(el) && text(el).length > 0 && !excluded;

    S.hover = el;
    el.dataset.sltiOldOutline = el.style.outline || "";
    el.style.outline =
      `2px solid ${auto ? "#22c55e" : ok ? "#f59e0b" : "#ef4444"}`;

    tip.textContent =
      `${auto ? "SPEAKABLE" : ok ? "CLICK TO MAKE SPEAKABLE" : "EXCLUDED"}\n` +
      `${elementName(el)}\nchars: ${text(el).length}`;

    tip.style.left = Math.min(innerWidth - 540, event.clientX + 14) + "px";
    tip.style.top = Math.min(innerHeight - 90, event.clientY + 14) + "px";
    tip.style.display = "block";
  };

  const pick = event => {
    if (!S.inspect) return;
    if (event.target.closest?.(
      "#site-local-tts-inspector,.site-local-tts-controls"
    )) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    const el = event.target;
    if (visible(el) && text(el).length) {
      bind(el);
      S.candidates.add(el);
      setStatus(`bound ${elementName(el)}`);
    }

    toggleInspector();
  };

  inspectButton.onclick = toggleInspector;
  panel.querySelector("#slti-scan").onclick = scan;
  panel.querySelector("#slti-health").onclick = health;

  document.addEventListener("mousemove", hover, true);
  document.addEventListener("click", pick, true);

  scan();
  if (PRIVILEGED_TRANSPORT) health();

  S.observer = new MutationObserver(mutations => {
    const external = mutations.some(m =>
      !m.target.closest?.(
        ".site-local-tts-controls,#site-local-tts-inspector,#site-local-tts-tip"
      )
    );

    if (!external) return;

    clearTimeout(S.timer);
    S.timer = setTimeout(scan, 300);
  });

  S.observer.observe(document.body, {childList: true, subtree: true});

  S.destroy = () => {
    stop();
    S.observer?.disconnect();
    clearTimeout(S.timer);
    document.removeEventListener("mousemove", hover, true);
    document.removeEventListener("click", pick, true);
    clearHover();
    document.documentElement.style.cursor = "";
    panel.remove();
    tip.remove();
    qsa(".site-local-tts-controls").forEach(x => x.remove());
    delete window.__SITE_LOCAL_TTS_USER__;
  };

  log("loaded", {
    version: "1.3.1",
    hostname: location.hostname,
    chatgpt: CHATGPT,
    privilegedTransport: PRIVILEGED_TRANSPORT
  });
})();
