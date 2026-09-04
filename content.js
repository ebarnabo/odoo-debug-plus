(() => {
  const state = {
    isOdoo: false,
    version: null,
    versionFull: null,
    db: null,
    user: null,
    debugMode: "off",
    url: location.href,
  };

  function parseDebugFromUrl(href) {
    try {
      const u = new URL(href);
      const d = u.searchParams.get("debug");
      if (d === null || d === "" || d === "0" || d === "false") return "off";
      if (d === "assets") return "assets";
      if (d === "tests") return "tests";
      return "1";
    } catch {
      return "off";
    }
  }

  function looksLikeOdooDom() {
    const b = document.body;
    if (!b) return false;
    if (/o_web_client|o_home_menu|o_action_manager|o_website/.test(b.className)) return true;
    if (document.querySelector(".o_web_client, .o_main_navbar, #oe_main_menu_navbar, .o_home_menu")) return true;
    if (document.querySelector('meta[name="generator"][content*="Odoo" i]')) return true;
    return false;
  }

  function extractSessionFromScripts() {
    const scripts = document.querySelectorAll("script");
    for (const s of scripts) {
      const t = s.textContent || "";
      if (!t.includes("server_version") && !t.includes("__session_info__") && !t.includes("session_info")) {
        continue;
      }
      const patterns = [
        /odoo\.__session_info__\s*=\s*(\{[\s\S]*?\});/,
        /odoo\.session_info\s*=\s*(\{[\s\S]*?\});/,
      ];
      for (const re of patterns) {
        const m = t.match(re);
        if (!m) continue;
        try {
          return JSON.parse(m[1]);
        } catch {
          /* ignore malformed */
        }
      }
    }
    return null;
  }

  function shortVersion(full) {
    if (!full) return null;
    const m = String(full).match(/(\d+\.\d+)/);
    return m ? m[1] : String(full).slice(0, 4);
  }

  function applySession(sess) {
    if (!sess || typeof sess !== "object") return;
    state.isOdoo = true;
    state.versionFull = sess.server_version || state.versionFull;
    if (Array.isArray(sess.server_version_info) && sess.server_version_info.length) {
      const [maj, min] = sess.server_version_info;
      if (maj != null) {
        state.version = `${maj}.${min ?? 0}`;
      }
    }
    if (!state.version && state.versionFull) state.version = shortVersion(state.versionFull);
    state.db = sess.db || state.db;
    state.user = sess.name || sess.username || state.user;
  }

  function publish() {
    state.debugMode = parseDebugFromUrl(location.href);
    state.url = location.href;
    chrome.runtime.sendMessage({ type: "odoo-info", payload: { ...state } }, () => { void chrome.runtime.lastError; });
  }

  function injectBridge() {
    const s = document.createElement("script");
    s.src = chrome.runtime.getURL("page-bridge.js");
    s.onload = () => s.remove();
    (document.head || document.documentElement).appendChild(s);
  }

  window.addEventListener("message", (ev) => {
    if (ev.source !== window) return;
    const data = ev.data;
    if (!data || data.source !== "odoo-debug-plus" || data.type !== "session") return;
    if (data.info && data.info.isOdoo) {
      applySession(data.info);
    }
    if (looksLikeOdooDom()) state.isOdoo = true;
    publish();
  });

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg && msg.type === "get-odoo-info") {
      state.debugMode = parseDebugFromUrl(location.href);
      sendResponse({ ...state });
      return true;
    }
  });

  applySession(extractSessionFromScripts());
  if (looksLikeOdooDom()) state.isOdoo = true;
  state.debugMode = parseDebugFromUrl(location.href);

  if (state.isOdoo || /\/web(\/|#|\?|$)|\/odoo(\/|#|\?|$)/.test(location.pathname + location.search)) {
    state.isOdoo = true;
  }

  publish();

  try {
    injectBridge();
  } catch {
    /* page-bridge is optional if web_accessible_resources missing */
  }

  if (!state.version) {
    fetch("/web/webclient/version_info", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method: "call", params: {}, id: Date.now() }),
      credentials: "include",
    })
      .then((r) => r.json())
      .then((j) => {
        const res = j && j.result;
        if (!res) return;
        state.isOdoo = true;
        state.versionFull = res.server_version || state.versionFull;
        if (Array.isArray(res.server_version_info)) {
          state.version = `${res.server_version_info[0]}.${res.server_version_info[1] ?? 0}`;
        } else if (state.versionFull) {
          state.version = shortVersion(state.versionFull);
        }
        publish();
      })
      .catch(() => {});
  }
})();
