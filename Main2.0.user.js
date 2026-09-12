// ==UserScript==
// @name         Discord Token Viewer
// @namespace    token-viewer
// @version      1.0
// @description  Shows YOUR OWN Discord token on-screen. Dont share your token to anyone.
// @author       Camper
// @match        https://discord.com/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  /* ============ TOKEN SOURCES (all local reads, no network) ============ */
  let hookToken = null;
  try {
    const origFetch = window.fetch.bind(window);
    window.fetch = function (input, init) {
      try {
        let h = null;
        if (init && init.headers) h = new Headers(init.headers);
        else if (typeof Request !== "undefined" && input instanceof Request) h = input.headers;
        if (h) {
          const auth = h.get("authorization");
          if (auth && auth.length > 50 && !/^Bot /i.test(auth)) hookToken = auth;
        }
      } catch (e) {}
      return origFetch.apply(this, arguments);
    };
  } catch (e) {}

  // Source B: localStorage
  function fromLocalStorage() {
    try {
      let t = localStorage.getItem("token");
      if (t) {
        t = t.replace(/^"+|"+$/g, ""); // strip JSON quotes if present
        if (t.length > 50) return t;
      }
    } catch (e) {}
    return null;
  }
  // Source C: webpack module scan — calls Discord's own getToken()
  function fromWebpack() {
    return new Promise((resolve) => {
      let settled = false;
      const done = (v) => { if (!settled) { settled = true; resolve(v); } };
      try {
        if (!window.webpackChunkdiscord_app || !Array.isArray(window.webpackChunkdiscord_app)) return done(null);
        window.webpackChunkdiscord_app.push([[Math.random()], {}, (req) => {
          try {
            for (const m of Object.values(req.c || {})) {
              let exp;
              try { exp = m && m.exports; } catch (e) { continue; }
              if (!exp) continue;
              const cands = [exp, exp.default];
              try { for (const k of Object.keys(exp)) cands.push(exp[k]); } catch (e) {}
              for (const c of cands) {
                if (c && typeof c.getToken === "function") {
                  let t = null;
                  try { t = c.getToken(); } catch (e) {}
                  if (typeof t === "string" && t.length > 50) return done(t);
                }
              }
            }
          } catch (e) {}
          done(null);
        }]);
        setTimeout(() => done(null), 3000);
      } catch (e) { done(null); }
    });
  }

  async function findToken() {
    return fromLocalStorage() || hookToken || (await fromWebpack());
  }

  /* ============ UI ============ */
  function buildUI() {
    if (document.getElementById("ltv-root")) return;

    const style = document.createElement("style");
    style.textContent = `
      #ltv-root{position:fixed;top:12px;right:12px;z-index:999999;font-family:'gg sans','Segoe UI',system-ui,sans-serif}
      #ltv-pill{display:none;width:34px;height:34px;align-items:center;justify-content:center;background:#1e1f22;border:1px solid #2b2d31;border-radius:50%;cursor:pointer;font-size:15px;box-shadow:0 4px 12px rgba(0,0,0,.4)}
      #ltv-panel{width:300px;background:#1e1f22;border:1px solid #2b2d31;border-radius:10px;padding:12px;color:#dbdee1;box-shadow:0 12px 32px rgba(0,0,0,.5)}
      #ltv-head{display:flex;align-items:center;gap:6px;font-size:13px;font-weight:700;color:#fff;cursor:move}
      #ltv-head .ltv-sub{font-weight:400;font-size:10px;color:#949ba4;margin-right:auto}
      #ltv-head .ltv-min{cursor:pointer;background:#2b2d31;border-radius:4px;width:18px;height:18px;display:flex;align-items:center;justify-content:center;font-size:12px}
      .ltv-status{font-size:11px;color:#949ba4;margin-top:8px;line-height:1.5}
      .ltv-row{display:flex;gap:6px;margin-top:10px}
      .ltv-btn{background:#5865f2;color:#fff;border:none;border-radius:6px;padding:7px 14px;font-size:12.5px;font-weight:600;cursor:pointer}
      .ltv-btn:hover{background:#4752c4}
      .ltv-ghost{background:#2b2d31;color:#dbdee1}
      .ltv-token{font-family:Consolas,monospace;font-size:10.5px;word-break:break-all;background:#111214;border:1px solid #2b2d31;border-radius:6px;padding:8px;color:#57f287;margin-top:8px;cursor:pointer}
      .ltv-warn{font-size:10px;color:#f0b132;margin-top:8px;line-height:1.45}
    `;
    (document.head || document.documentElement).appendChild(style);

    const root = document.createElement("div");
    root.id = "ltv-root";
    root.innerHTML = `
      <div id="ltv-pill">🔑</div>
      <div id="ltv-panel">
        <div id="ltv-head">
          <span>🔑 Token Viewer</span>
          <span class="ltv-sub">local only</span>
          <span id="ltv-min" title="collapse">–</span>
        </div>
        <div class="ltv-status" id="ltv-status">Shows YOUR token</div>
        <div class="ltv-row">
          <button class="ltv-btn" id="ltv-get">Get Token</button>
          <button class="ltv-btn ltv-ghost" id="ltv-copy" style="display:none">Copy</button>
        </div>
        <div class="ltv-token" id="ltv-token" style="display:none" title="click to show/hide full token"></div>
        <div class="ltv-warn">⚠️ Your token = full access to your account.<br>Dont share your token to anyone</div>
      </div>
    `;
    document.documentElement.appendChild(root);

    let currentToken = null;
    const panel = root.querySelector("#ltv-panel");
    const pill = root.querySelector("#ltv-pill");
    const status = root.querySelector("#ltv-status");
    const tokenBox = root.querySelector("#ltv-token");
    const getBtn = root.querySelector("#ltv-get");
    const copyBtn = root.querySelector("#ltv-copy");

    const mask = (t) => t.slice(0, 10) + " … " + t.slice(-4);

    getBtn.addEventListener("click", async () => {
      status.textContent = "looking…";
      const t = await findToken();
      if (!t) {
        status.innerHTML = "No token found — make sure you're <b>logged in</b>, then retry.";
        return;
      }
      currentToken = t;
      tokenBox.textContent = mask(t);
      tokenBox.style.display = "block";
      copyBtn.style.display = "inline-block";
      status.textContent = "Got it — it stays on this screen only.";
    });

    tokenBox.addEventListener("click", () => {
      if (!currentToken) return;
      tokenBox.textContent = tokenBox.textContent === currentToken ? mask(currentToken) : currentToken;
    });

    copyBtn.addEventListener("click", async () => {
      if (!currentToken) return;
      let ok = false;
      try { await navigator.clipboard.writeText(currentToken); ok = true; } catch (e) {}
      if (!ok) {
        try {
          const ta = document.createElement("textarea");
          ta.value = currentToken;
          ta.style.position = "fixed";
          ta.style.opacity = "0";
          document.body.appendChild(ta);
          ta.select();
          document.execCommand("copy");
          document.body.removeChild(ta);
          ok = true;
        } catch (e) {}
      }
      copyBtn.textContent = ok ? "Copied!" : "Failed";
      setTimeout(() => (copyBtn.textContent = "Copy"), 1500);
    });

    // collapse / expand
    root.querySelector("#ltv-min").addEventListener("click", (e) => {
      e.stopPropagation();
      panel.style.display = "none";
      pill.style.display = "flex";
    });
    pill.addEventListener("click", () => {
      pill.style.display = "none";
      panel.style.display = "block";
    });

    // drag by the header
    const head = root.querySelector("#ltv-head");
    let dx = 0, dy = 0, dragging = false;
    head.addEventListener("mousedown", (e) => {
      dragging = true;
      const r = root.getBoundingClientRect();
      dx = e.clientX - r.left;
      dy = e.clientY - r.top;
      e.preventDefault();
    });
    window.addEventListener("mousemove", (e) => {
      if (!dragging) return;
      root.style.left = Math.max(0, e.clientX - dx) + "px";
      root.style.top = Math.max(0, e.clientY - dy) + "px";
      root.style.right = "auto";
    });
    window.addEventListener("mouseup", () => (dragging = false));
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", buildUI);
  } else {
    buildUI();
  }
})();
