// ==UserScript==
// @name         Site Local TTS
// @namespace    local.site.tts
// @version      1.0.0
// @description  Adds inline local eSpeak-NG TTS buttons to readable page content.
// @match        http://*/*
// @match        https://*/*
// @grant        GM_xmlhttpRequest
// @connect      127.0.0.1
// @run-at       document-idle
// ==/UserScript==

(() => {
  "use strict";

  if (window.__SITE_LOCAL_TTS_USER__) return;
  window.__SITE_LOCAL_TTS_USER__ = true;

  const ENDPOINT = "http://127.0.0.1:8765/tts";
  const SELECTORS = [
    '[data-message-author-role="assistant"]',
    '[data-role="assistant"]',
    '[class*="assistant"][class*="message"]',
    '.ds-markdown',
    'article',
    '[role="article"]',
    'main [class*="markdown"]',
    'main [class*="message"]'
  ];

  let currentAudio = null;
  let currentButton = null;

  const clean = text =>
    String(text || "").replace(/\s+/g, " ").replace(/^🔊\s*/, "").trim();

  const visible = el => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 80 && r.height > 20 &&
      s.display !== "none" && s.visibility !== "hidden";
  };

  const stop = () => {
    if (currentAudio) {
      currentAudio.pause();
      currentAudio.src = "";
      currentAudio = null;
    }
    if (currentButton) currentButton.textContent = "🔊";
    currentButton = null;
  };

  const requestAudio = text => new Promise((resolve, reject) => {
    if (typeof GM_xmlhttpRequest === "function") {
      GM_xmlhttpRequest({
        method: "POST",
        url: ENDPOINT,
        headers: {"Content-Type": "text/plain;charset=UTF-8"},
        data: clean(text),
        responseType: "blob",
        onload: r => {
          if (r.status >= 200 && r.status < 300) resolve(r.response);
          else reject(new Error(`TTS HTTP ${r.status}`));
        },
        onerror: () => reject(new Error("Local TTS request failed"))
      });
      return;
    }

    const opts = {
      method: "POST",
      mode: "cors",
      body: clean(text),
      headers: {"Content-Type": "text/plain;charset=UTF-8"}
    };

    try { opts.targetAddressSpace = "loopback"; } catch {}

    fetch(new Request(ENDPOINT, opts))
      .then(r => {
        if (!r.ok) throw new Error(`TTS HTTP ${r.status}`);
        return r.blob();
      })
      .then(resolve, reject);
  });

  const speak = async (text, button) => {
    stop();
    button.textContent = "⏳";
    currentButton = button;

    try {
      const blob = await requestAudio(text);
      const url = URL.createObjectURL(blob);
      currentAudio = new Audio(url);

      currentAudio.onended = () => {
        URL.revokeObjectURL(url);
        stop();
      };

      currentAudio.onerror = () => {
        URL.revokeObjectURL(url);
        button.textContent = "❌";
        currentAudio = null;
        currentButton = null;
      };

      button.textContent = "⏹";
      await currentAudio.play();
    } catch (error) {
      console.error("[Site Local TTS]", error);
      button.textContent = "❌";
      button.title = String(error);
      currentAudio = null;
      currentButton = null;
    }
  };

  const candidates = () => {
    const seen = new Set();
    const out = [];

    for (const selector of SELECTORS) {
      document.querySelectorAll(selector).forEach(el => {
        if (seen.has(el) || !visible(el) || clean(el.innerText).length < 40) return;
        seen.add(el);
        out.push(el);
      });
    }

    if (!out.length) {
      const root = document.querySelector("main") || document.body;
      root.querySelectorAll("section,div").forEach(el => {
        if (!visible(el)) return;
        const text = clean(el.innerText);
        if (text.length < 120 || text.length > 20000) return;
        const substantialChildren = [...el.children]
          .filter(c => clean(c.innerText).length > 100).length;
        if (substantialChildren <= 3) out.push(el);
      });
    }

    return out;
  };

  const addButtons = () => {
    candidates().forEach(el => {
      if (el.querySelector(":scope > .site-local-tts-button")) return;

      const button = document.createElement("button");
      button.className = "site-local-tts-button";
      button.textContent = "🔊";
      button.title = "Read this block";
      button.style.cssText =
        "margin:4px 6px 4px 0;padding:2px 7px;border:1px solid #7776;" +
        "border-radius:6px;background:transparent;color:inherit;cursor:pointer;" +
        "font:14px system-ui;line-height:1.4;vertical-align:middle";

      button.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        if (currentButton === button && currentAudio) stop();
        else speak(el.innerText, button);
      });

      el.prepend(button);
    });
  };

  addButtons();
  new MutationObserver(addButtons)
    .observe(document.body, {childList: true, subtree: true});
})();
