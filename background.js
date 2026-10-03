const ICONS = {
  off: { 16: "icons/off_16.png", 32: "icons/off_32.png", 48: "icons/off_48.png", 128: "icons/off_128.png" },
  on: { 16: "icons/on_16.png", 32: "icons/on_32.png", 48: "icons/on_48.png", 128: "icons/on_128.png" },
  assets: { 16: "icons/assets_16.png", 32: "icons/assets_32.png", 48: "icons/assets_48.png", 128: "icons/assets_128.png" },
  idle: { 16: "icons/idle_16.png", 32: "icons/idle_32.png", 48: "icons/idle_48.png", 128: "icons/idle_128.png" },
};

const cache = new Map();

function ignoreLastError() { void chrome.runtime.lastError; }

function menusApi() {
  if (typeof browser !== "undefined" && browser.menus) return browser.menus;
  return chrome.contextMenus;
}

async function tabExists(tabId) {
  if (tabId == null) return false;
  try { return !!(await chrome.tabs.get(tabId)); }
  catch { ignoreLastError(); return false; }
}

function safeSendMessage(tabId, msg) {
  return new Promise((resolve) => {
    if (tabId == null) return resolve(undefined);
    try {
      chrome.tabs.sendMessage(tabId, msg, (res) => { ignoreLastError(); resolve(res); });
    } catch { ignoreLastError(); resolve(undefined); }
  });
}

async function safeTabUpdate(tabId, update) {
  if (!(await tabExists(tabId))) return null;
  try { return await chrome.tabs.update(tabId, update); }
  catch { ignoreLastError(); return null; }
}

function parseDebug(url) {
  try {
    const d = new URL(url).searchParams.get("debug");
    if (d === null || d === "" || d === "0" || d === "false") return "off";
    if (d === "assets") return "assets";
    if (d === "tests") return "tests";
    return "1";
  } catch { return "off"; }
}

function backendPath(url) {
  try { if (new URL(url).pathname.startsWith("/odoo")) return "/odoo"; } catch {}
  return "/web";
}

function modelUrl(currentUrl, model, view = "list") {
  const u = new URL(currentUrl);
  const params = new URLSearchParams(u.search);
  if (!params.get("debug") || params.get("debug") === "0") params.set("debug", "1");
  return `${u.origin}${backendPath(currentUrl)}?${params.toString()}#model=${encodeURIComponent(model)}&view_type=${encodeURIComponent(view)}`;
}

function pathUrl(currentUrl, path) {
  const u = new URL(currentUrl);
  if (!path) {
    const params = new URLSearchParams(u.search);
    return `${u.origin}${backendPath(currentUrl)}${params.toString() ? "?" + params.toString() : ""}`;
  }
  return `${u.origin}${path}`;
}

function buildUrl(currentUrl, debugValue) {
  const u = new URL(currentUrl);
  const params = new URLSearchParams(u.search);
  params.set("debug", debugValue === "off" ? "0" : debugValue);
  return `${u.origin}${u.pathname}?${params.toString()}${u.hash}`;
}

function badgeText(info) {
  if (!info || !info.isOdoo) return "";
  const v = info.version || "";
  return v.length > 4 ? v.slice(0, 4) : v;
}

function badgeColor(mode) {
  if (mode === "assets" || mode === "tests") return "#D68C1A";
  if (mode === "1") return "#714B67";
  return "#3D4454";
}

async function paint(tabId, info) {
  if (!(await tabExists(tabId))) return;
  const isOdoo = !!(info && info.isOdoo);
  const mode = info?.debugMode || parseDebug(info?.url || "");
  const iconKey = !isOdoo ? "idle" : mode === "assets" || mode === "tests" ? "assets" : mode === "1" ? "on" : "off";
  syncMenus(info);
  try {
    await chrome.action.setIcon({ tabId, path: ICONS[iconKey] });
    await chrome.action.setBadgeBackgroundColor({ tabId, color: badgeColor(isOdoo ? mode : "off") });
    try { await chrome.action.setBadgeTextColor({ tabId, color: "#FFFFFF" }); } catch { ignoreLastError(); }
    await chrome.action.setBadgeText({ tabId, text: isOdoo ? badgeText(info) : "" });
    let title = "Odoo Debug+";
    if (isOdoo) {
      const v = info.versionFull || info.version || "?";
      const dbg = mode === "1" ? "debug ON" : mode === "assets" ? "debug ASSETS" : mode === "tests" ? "debug TESTS" : "debug OFF";
      title = `Odoo ${v} · ${dbg}${info.db ? ` · ${info.db}` : ""}`;
    } else title = "Pas une page Odoo";
    await chrome.action.setTitle({ tabId, title });
  } catch {}
}

async function readSessionFromPage(tabId) {
  const func = () => {
    const odoo = window.odoo;
    const session = (odoo && (odoo.__session_info__ || odoo.session_info || odoo.session)) || window.__session_info__ || null;
    const body = document.body ? document.body.className : "";
    const isOdoo = !!(odoo || session || /o_web_client|o_home_menu|o_action_manager|o_website/.test(body));
    return {
      isOdoo,
      server_version: session?.server_version || null,
      server_version_info: session?.server_version_info || null,
      db: session?.db || null,
      name: session?.name || session?.username || null,
    };
  };
  try {
    const [{ result } = {}] = await chrome.scripting.executeScript({ target: { tabId }, world: "MAIN", func });
    return result || null;
  } catch {
    try {
      const [{ result } = {}] = await chrome.scripting.executeScript({ target: { tabId }, func });
      return result || null;
    } catch { return null; }
  }
}

function normalizeInfo(raw, tabUrl) {
  const info = { isOdoo: false, version: null, versionFull: null, db: null, user: null, debugMode: parseDebug(tabUrl), url: tabUrl };
  if (!raw) return info;
  info.isOdoo = !!raw.isOdoo;
  info.versionFull = raw.server_version || raw.versionFull || null;
  info.db = raw.db || null;
  info.user = raw.name || raw.user || null;
  if (Array.isArray(raw.server_version_info) && raw.server_version_info.length) {
    info.version = `${raw.server_version_info[0]}.${raw.server_version_info[1] ?? 0}`;
  } else if (info.versionFull) {
    const m = String(info.versionFull).match(/(\d+\.\d+)/);
    info.version = m ? m[1] : String(info.versionFull).slice(0, 4);
  } else if (raw.version) info.version = raw.version;
  info.debugMode = raw.debugMode || parseDebug(tabUrl);
  return info;
}

async function refreshTab(tabId, tabUrl) {
  if (!(await tabExists(tabId))) return;
  if (!tabUrl || /^(chrome|chrome-extension|edge|about|devtools):/i.test(tabUrl)) {
    await paint(tabId, { isOdoo: false });
    return;
  }
  let info = cache.get(tabId) || { isOdoo: false, debugMode: parseDebug(tabUrl), url: tabUrl };
  const fromPage = await readSessionFromPage(tabId);
  if (fromPage) info = { ...info, ...normalizeInfo(fromPage, tabUrl) };
  try {
    const fromContent = await safeSendMessage(tabId, { type: "get-odoo-info" });
    if (fromContent) {
      info = {
        ...info, ...fromContent,
        isOdoo: info.isOdoo || fromContent.isOdoo,
        version: fromContent.version || info.version,
        versionFull: fromContent.versionFull || info.versionFull,
        db: fromContent.db || info.db,
        debugMode: parseDebug(tabUrl),
        url: tabUrl,
      };
    }
  } catch {}
  if (!info.isOdoo && /\/(web|odoo)(\/|$|\?|#)/.test(tabUrl)) info.isOdoo = true;
  info.debugMode = parseDebug(tabUrl);
  info.url = tabUrl;
  cache.set(tabId, info);
  await paint(tabId, info);
  return info;
}

async function toggleDebug(tab, mode) {
  if (!tab?.id || !tab.url) return;
  const current = parseDebug(tab.url);
  let next;
  if (mode === "assets") next = current === "assets" ? "off" : "assets";
  else if (mode === "tests") next = current === "tests" ? "off" : "tests";
  else if (mode === "1") next = current === "off" ? "1" : "off";
  else next = current === "off" ? "1" : "off";
  await safeTabUpdate(tab.id, { url: buildUrl(tab.url, next) });
}

async function setDebug(tab, mode) {
  if (!tab?.id || !tab.url) return;
  await safeTabUpdate(tab.id, { url: buildUrl(tab.url, mode) });
}

async function toggleTerminal(tab) {
  if (!tab?.id || !(await tabExists(tab.id))) return false;
  let res = await safeSendMessage(tab.id, { type: "toggle-terminal" });
  if (!res) {
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["terminal.js"] });
      res = await safeSendMessage(tab.id, { type: "toggle-terminal" });
    } catch { ignoreLastError(); }
  }
  return !!res;
}

async function copyText(tab, text) {
  if (!tab?.id || !text) return;
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (value) => navigator.clipboard.writeText(value),
      args: [text],
    });
  } catch { ignoreLastError(); }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "odoo-info" && sender.tab?.id != null) {
    const info = normalizeInfo(msg.payload, sender.tab.url);
    cache.set(sender.tab.id, info);
    paint(sender.tab.id, info);
  }
  if (msg?.type === "get-active-info") {
    chrome.tabs.query({ active: true, currentWindow: true }).then(async ([tab]) => {
      if (!tab) return sendResponse({ isOdoo: false });
      sendResponse(await refreshTab(tab.id, tab.url));
    });
    return true;
  }
  if (msg?.type === "set-debug") {
    chrome.tabs.query({ active: true, currentWindow: true }).then(async ([tab]) => {
      if (!tab?.url) return sendResponse({ ok: false });
      await safeTabUpdate(tab.id, { url: buildUrl(tab.url, msg.mode) });
      sendResponse({ ok: true });
    });
    return true;
  }
  if (msg?.type === "navigate-model") {
    chrome.tabs.query({ active: true, currentWindow: true }).then(async ([tab]) => {
      if (!tab?.url) return sendResponse({ ok: false });
      await safeTabUpdate(tab.id, { url: modelUrl(tab.url, msg.model, msg.view) });
      sendResponse({ ok: true });
    });
    return true;
  }
  if (msg?.type === "toggle-terminal") {
    chrome.tabs.query({ active: true, currentWindow: true }).then(async ([tab]) => {
      if (!tab?.id) return sendResponse({ ok: false });
      try {
        sendResponse({ ok: await toggleTerminal(tab) });
      } catch (e) {
        ignoreLastError();
        sendResponse({ ok: false, error: String(e) });
      }
    });
    return true;
  }
  if (msg?.type === "navigate-path") {
    chrome.tabs.query({ active: true, currentWindow: true }).then(async ([tab]) => {
      if (!tab?.url) return sendResponse({ ok: false });
      await safeTabUpdate(tab.id, { url: pathUrl(tab.url, msg.path) });
      sendResponse({ ok: true });
    });
    return true;
  }
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (tab) refreshTab(tab.id, tab.url);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!tabId || !tab) return;
  if (changeInfo.status === "complete" || changeInfo.url) refreshTab(tabId, tab.url || "");
});

chrome.windows.onFocusChanged.addListener(async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) refreshTab(tab.id, tab.url);
});

chrome.commands.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;
  if (command === "toggle-debug") await toggleDebug(tab, "1");
  if (command === "toggle-assets") await toggleDebug(tab, "assets");
  if (command === "toggle-terminal") await toggleTerminal(tab);
});

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab?.url) return;
  await toggleDebug(tab, "1");
});

const ACTION_CTX = { contexts: ["action"] };
const QUICK_PATHS = {
  "quick-backend": null,
  "quick-site": "/",
  "quick-selector": "/web/database/selector",
  "quick-manager": "/web/database/manager",
  "quick-login": "/web/login",
};

function hashParams(url) {
  try { return new URLSearchParams((new URL(url).hash || "").replace(/^#/, "")); }
  catch { return new URLSearchParams(); }
}

let menuGen = 0;

function installMenus() {
  const menus = menusApi();
  const gen = ++menuGen;
  Promise.resolve(menus.removeAll())
    .catch(ignoreLastError)
    .then(() => {
      if (gen !== menuGen) return;
      const items = [
        { id: "mode-dev", title: "Mode développeur", type: "checkbox", checked: false, ...ACTION_CTX },
        { id: "mode-1", title: "Debug", type: "checkbox", checked: false, ...ACTION_CTX },
        { id: "mode-assets", title: "Assets", type: "checkbox", checked: false, ...ACTION_CTX },
        { id: "mode-tests", title: "Tests", type: "checkbox", checked: false, ...ACTION_CTX },
        { id: "toggle-terminal", title: "Terminal", ...ACTION_CTX },
        { id: "quick", title: "Accès rapide", ...ACTION_CTX },
        { id: "quick-backend", parentId: "quick", title: "Backend", ...ACTION_CTX },
        { id: "quick-site", parentId: "quick", title: "Site web", ...ACTION_CTX },
        { id: "quick-selector", parentId: "quick", title: "Choisir une base", ...ACTION_CTX },
        { id: "quick-manager", parentId: "quick", title: "Manager des bases", ...ACTION_CTX },
        { id: "quick-login", parentId: "quick", title: "Écran de connexion", ...ACTION_CTX },
        { id: "quick-copy-url", parentId: "quick", title: "Copier l’URL", ...ACTION_CTX },
        { id: "quick-copy-db", parentId: "quick", title: "Copier la base", enabled: false, ...ACTION_CTX },
        { id: "quick-copy-model", parentId: "quick", title: "Copier le modèle", enabled: false, ...ACTION_CTX },
        { id: "quick-copy-id", parentId: "quick", title: "Copier l’ID", enabled: false, ...ACTION_CTX },
      ];
      for (const item of items) {
        try { menus.create(item); } catch { ignoreLastError(); }
      }
    });
}

async function syncMenus(info) {
  const mode = info?.debugMode || "off";
  const isOdoo = !!info?.isOdoo;
  const hasSite = !!(info?.url && /^https?:/i.test(info.url));
  const hash = hashParams(info?.url || "");
  const db = info?.db || "";
  const model = hash.get("model") || "";
  const recordId = hash.get("id") || "";
  const updates = [
    ["mode-dev", { checked: mode !== "off", enabled: isOdoo }],
    ["mode-1", { checked: mode === "1", enabled: isOdoo }],
    ["mode-assets", { checked: mode === "assets", enabled: isOdoo }],
    ["mode-tests", { checked: mode === "tests", enabled: isOdoo }],
    ["toggle-terminal", { enabled: isOdoo }],
    ["quick", { enabled: hasSite }],
    ["quick-copy-db", { enabled: !!db, title: db ? `Copier la base (${db})` : "Copier la base" }],
    ["quick-copy-model", { enabled: !!model, title: model ? `Copier le modèle (${model})` : "Copier le modèle" }],
    ["quick-copy-id", { enabled: !!recordId, title: recordId ? `Copier l’ID (${recordId})` : "Copier l’ID" }],
  ];
  for (const [menuId, patch] of updates) {
    try { await menusApi().update(menuId, patch); }
    catch { ignoreLastError(); }
  }
}

async function openPanel() {
  try {
    await chrome.action.setPopup({ popup: "popup.html" });
    await chrome.action.openPopup();
  } catch {
    ignoreLastError();
    const win = await chrome.windows.getCurrent().catch(() => null);
    const width = 332;
    const height = 620;
    try {
      await chrome.windows.create({
        url: chrome.runtime.getURL("popup.html"),
        type: "popup",
        width,
        height,
        focused: true,
        ...(win ? {
          left: Math.max(0, (win.left || 0) + (win.width || width) - width - 8),
          top: (win.top || 0) + 48,
        } : {}),
      });
    } catch { ignoreLastError(); }
  } finally {
    setTimeout(() => {
      try { Promise.resolve(chrome.action.setPopup({ popup: "" })).catch(ignoreLastError); }
      catch { ignoreLastError(); }
    }, 120);
  }
}

const menus = menusApi();
if (menus.onShown) {
  menus.onShown.addListener((info) => {
    const contexts = info?.contexts || [];
    if (contexts.includes("action") || contexts.includes("browser_action") || contexts.includes("page_action")) {
      openPanel();
    }
  });
}

installMenus();
chrome.runtime.onInstalled.addListener(installMenus);
chrome.runtime.onStartup.addListener(installMenus);

menus.onClicked.addListener(async (info, tab) => {
  const id = info.menuItemId;
  if (!tab?.url) return;
  if (id === "mode-dev") await toggleDebug(tab, "1");
  if (id === "mode-1") await setDebug(tab, parseDebug(tab.url) === "1" ? "off" : "1");
  if (id === "mode-assets") await toggleDebug(tab, "assets");
  if (id === "mode-tests") await toggleDebug(tab, "tests");
  if (id === "toggle-terminal") await toggleTerminal(tab);
  if (Object.hasOwn(QUICK_PATHS, id)) await safeTabUpdate(tab.id, { url: pathUrl(tab.url, QUICK_PATHS[id]) });
  if (id === "quick-copy-url") await copyText(tab, tab.url);
  if (id === "quick-copy-db") await copyText(tab, cache.get(tab.id)?.db || "");
  if (id === "quick-copy-model") await copyText(tab, hashParams(tab.url).get("model") || "");
  if (id === "quick-copy-id") await copyText(tab, hashParams(tab.url).get("id") || "");
});

chrome.tabs.onRemoved.addListener((tabId) => cache.delete(tabId));
