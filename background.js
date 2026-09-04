const ICONS = {
  off: { 16: "icons/off_16.png", 32: "icons/off_32.png", 48: "icons/off_48.png", 128: "icons/off_128.png" },
  on: { 16: "icons/on_16.png", 32: "icons/on_32.png", 48: "icons/on_48.png", 128: "icons/on_128.png" },
  assets: { 16: "icons/assets_16.png", 32: "icons/assets_32.png", 48: "icons/assets_48.png", 128: "icons/assets_128.png" },
  idle: { 16: "icons/idle_16.png", 32: "icons/idle_32.png", 48: "icons/idle_48.png", 128: "icons/idle_128.png" },
};

const cache = new Map();

function ignoreLastError() { void chrome.runtime.lastError; }

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
  try {
    const [{ result } = {}] = await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: () => {
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
      },
    });
    return result || null;
  } catch { return null; }
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
  else if (mode === "1") next = current === "off" ? "1" : "off";
  else next = current === "off" ? "1" : "off";
  await safeTabUpdate(tab.id, { url: buildUrl(tab.url, next) });
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
        if (!(await tabExists(tab.id))) return sendResponse({ ok: false });
        let res = await safeSendMessage(tab.id, { type: "toggle-terminal" });
        if (!res) {
          await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["terminal.js"] });
          res = await safeSendMessage(tab.id, { type: "toggle-terminal" });
        }
        sendResponse({ ok: !!res });
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
  if (command === "toggle-terminal") {
    if (!(await tabExists(tab.id))) return;
    let res = await safeSendMessage(tab.id, { type: "toggle-terminal" });
    if (!res) {
      try {
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["terminal.js"] });
        await safeSendMessage(tab.id, { type: "toggle-terminal" });
      } catch { ignoreLastError(); }
    }
  }
});

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab?.url) return;
  await toggleDebug(tab, "1");
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: "toggle-debug", title: "Activer / désactiver le debug", contexts: ["action"] });
    chrome.contextMenus.create({ id: "toggle-assets", title: "Debug assets", contexts: ["action"] });
    chrome.contextMenus.create({ id: "debug-off", title: "Désactiver le debug", contexts: ["action"] });
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.url) return;
  if (info.menuItemId === "toggle-debug") await toggleDebug(tab, "1");
  if (info.menuItemId === "toggle-assets") await toggleDebug(tab, "assets");
  if (info.menuItemId === "debug-off") await safeTabUpdate(tab.id, { url: buildUrl(tab.url, "off") });
});

chrome.tabs.onRemoved.addListener((tabId) => cache.delete(tabId));
