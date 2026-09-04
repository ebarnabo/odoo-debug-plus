const $ = (id) => document.getElementById(id);

const QUICK = [
  { label: "Backend", kind: "path", path: null },
  { label: "Site web", kind: "path", path: "/" },
  { label: "Choisir une base", kind: "path", path: "/web/database/selector" },
  { label: "Manager des bases", kind: "path", path: "/web/database/manager" },
  { label: "Écran de connexion", kind: "path", path: "/web/login" },
  { label: "Copier l’URL", kind: "copy-url" },
];

function parseHash(url) {
  try {
    const p = new URLSearchParams((new URL(url).hash || "").replace(/^#/, ""));
    return { model: p.get("model"), id: p.get("id") };
  } catch {
    return { model: null, id: null };
  }
}

function toast(text) {
  const el = $("toast");
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { el.hidden = true; }, 1200);
}

async function copy(text, label) {
  if (!text) return;
  await navigator.clipboard.writeText(text);
  toast(label + " copié");
}

function setChip(id, value) {
  const el = $(id);
  if (!value) { el.hidden = true; return; }
  el.hidden = false;
  el.querySelector("b").textContent = value;
}

let current = { debugMode: "off", url: "", db: null };

function paint(info) {
  current = info || current;
  const isOdoo = !!info?.isOdoo;
  document.body.classList.toggle("not-odoo", !isOdoo);
  $("empty").hidden = isOdoo;

  $("version").textContent = isOdoo ? (info.version || info.versionFull || "?") : "—";
  $("version-full").textContent =
    isOdoo && info.versionFull && info.versionFull !== info.version ? info.versionFull : "";
  try { $("host").textContent = info?.url ? new URL(info.url).host : "Aucune instance"; }
  catch { $("host").textContent = "Aucune instance"; }

  const mode = info?.debugMode || "off";
  const state = $("state");
  state.textContent = !isOdoo ? "Hors Odoo" : mode === "off" ? "Off" : mode === "1" ? "Debug" : mode;
  state.className = "state" + (mode === "1" ? " on" : mode === "off" || !isOdoo ? "" : " assets");

  const btn = $("btn-debug");
  btn.classList.toggle("active", mode !== "off");
  btn.classList.toggle("assets", mode === "assets" || mode === "tests");
  $("debug-label").textContent =
    mode === "off" ? "Inactif — clic pour activer" :
    mode === "assets" ? "Assets — clic pour couper" :
    mode === "tests" ? "Tests — clic pour couper" :
    "Actif — clic pour désactiver";

  for (const m of ["1", "assets", "tests"]) {
    $(`mode-${m}`).classList.toggle("active", mode === m);
  }

  const hash = parseHash(info?.url || "");
  setChip("copy-db", info?.db);
  setChip("copy-model", hash.model);
  setChip("copy-id", hash.id);
}

async function setMode(mode) {
  await chrome.runtime.sendMessage({ type: "set-debug", mode });
  window.close();
}

async function runQuick(item) {
  if (item.kind === "copy-url") {
    await copy(current.url, "URL");
    return;
  }
  await chrome.runtime.sendMessage({ type: "navigate-path", path: item.path });
  window.close();
}

const list = $("quick");
for (const item of QUICK) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "row";
  b.innerHTML = `<span>${item.label}</span><i>›</i>`;
  b.addEventListener("click", () => runQuick(item));
  list.appendChild(b);
}

$("btn-debug").addEventListener("click", () => setMode(current.debugMode === "off" ? "1" : "off"));
$("mode-1").addEventListener("click", () => setMode(current.debugMode === "1" ? "off" : "1"));
$("mode-assets").addEventListener("click", () => setMode(current.debugMode === "assets" ? "off" : "assets"));
$("mode-tests").addEventListener("click", () => setMode(current.debugMode === "tests" ? "off" : "tests"));
$("copy-db").addEventListener("click", () => copy(current.db, "Base"));
$("copy-model").addEventListener("click", () => copy(parseHash(current.url || "").model, "Modèle"));
$("copy-id").addEventListener("click", () => copy(parseHash(current.url || "").id, "ID"));

chrome.runtime.sendMessage({ type: "get-active-info" }).then(paint);

$("btn-term").addEventListener("click", async () => {
  const res = await chrome.runtime.sendMessage({ type: "toggle-terminal" });
  if (!res?.ok) toast("Recharge la page Odoo puis réessaie");
  else window.close();
});
