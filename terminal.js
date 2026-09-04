(() => {
  if (window.__odooDebugPlusTerm) return;
  window.__odooDebugPlusTerm = true;

  let open = false, host = null, shadow = null, history = [], histIdx = -1, session = null;

  const CSS = `:host{all:initial}*{box-sizing:border-box;font-family:Inter,system-ui,sans-serif}.wrap{position:fixed;left:16px;right:16px;bottom:16px;z-index:2147483646;height:320px;display:flex;flex-direction:column;background:#fff;color:#212529;border:1px solid #dee2e6;border-radius:10px;overflow:hidden;box-shadow:0 16px 40px rgba(33,37,41,.18)}.bar{background:#714b67;color:#fff;display:flex;align-items:center;gap:10px;padding:8px 10px}.bar b{font-size:13px}.bar span{font-size:11px;opacity:.8;margin-left:auto}.bar button{background:rgba(255,255,255,.14);color:#fff;border:0;border-radius:6px;padding:4px 8px;cursor:pointer;font:12px/1 Inter,system-ui,sans-serif;font-weight:600}.out{flex:1;overflow:auto;padding:10px 12px;background:#1b1520;color:#e9ecef;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;line-height:1.45;white-space:pre-wrap;word-break:break-word}.out .in{color:#fbb131}.out .ok{color:#7bd4c4}.out .err{color:#ff8a80}.out .muted{color:#9aa0a6}.row{display:flex;align-items:center;gap:8px;padding:8px 10px;border-top:1px solid #dee2e6;background:#f8f9fa}.row em{color:#714b67;font-style:normal;font-weight:700;font-family:ui-monospace,Menlo,monospace}.row input{flex:1;border:1px solid #dee2e6;border-radius:7px;padding:8px 10px;font:13px ui-monospace,Menlo,monospace;outline:none}.row input:focus{border-color:#714b67}`;

  function ensure() {
    if (host) return;
    host = document.createElement("div");
    host.id = "odp-term-host";
    shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `<style>${CSS}</style><div class="wrap"><div class="bar"><b>Terminal</b><span id="meta">Odoo</span><button type="button" id="help">Aide</button><button type="button" id="cls">Vider</button><button type="button" id="close">Fermer</button></div><div class="out" id="out"></div><div class="row"><em>❯</em><input id="in" autocomplete="off" spellcheck="false" placeholder="help  ·  search -m res.partner -f name -l 10" /></div></div>`;
    document.documentElement.appendChild(host);
    shadow.getElementById("close").onclick = hide;
    shadow.getElementById("cls").onclick = () => { shadow.getElementById("out").textContent = ""; };
    shadow.getElementById("help").onclick = () => run("help");
    shadow.getElementById("in").addEventListener("keydown", onKey);
  }

  function show() {
    ensure();
    host.style.display = "block";
    open = true;
    shadow.getElementById("in").focus();
    if (!shadow.getElementById("out").childElementCount) {
      print("muted", "Odoo Debug+  ·  tape help. Échap pour fermer.");
      run("whoami");
    }
  }
  function hide() { if (host) host.style.display = "none"; open = false; }
  function toggle() { open ? hide() : show(); }

  function print(cls, text) {
    const out = shadow.getElementById("out");
    const line = document.createElement("div");
    line.className = cls || "";
    line.textContent = text;
    out.appendChild(line);
    out.scrollTop = out.scrollHeight;
  }
  function printJson(data) { print("ok", typeof data === "string" ? data : JSON.stringify(data, null, 2)); }

  async function rpc(url, params) {
    const res = await fetch(url, {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method: "call", params, id: Date.now() }),
    });
    const json = await res.json();
    if (json.error) {
      const e = json.error;
      throw new Error((e.data && (e.data.message || e.data.debug)) || e.message || JSON.stringify(e));
    }
    return json.result;
  }
  const callKw = (model, method, args = [], kwargs = {}) => rpc("/web/dataset/call_kw", { model, method, args, kwargs });

  async function getSession() {
    if (session) return session;
    session = await rpc("/web/session/get_session_info", {});
    const bits = [session.server_version, session.db, session.username || session.name].filter(Boolean);
    shadow.getElementById("meta").textContent = bits.join("  ·  ");
    return session;
  }

  function tokenize(line) {
    const out = []; let cur = ""; let q = null;
    for (const c of line) {
      if (q) { if (c === q) q = null; else cur += c; continue; }
      if (c === "'" || c === '"') { q = c; continue; }
      if (/\s/.test(c)) { if (cur) { out.push(cur); cur = ""; } continue; }
      cur += c;
    }
    if (cur) out.push(cur);
    return out;
  }

  function parseCmd(line) {
    const tokens = tokenize(line.trim());
    if (!tokens.length) return null;
    const cmd = tokens.shift().toLowerCase();
    const flags = {}, pos = [];
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      if (t.startsWith("-") && t.length <= 3) {
        flags[t.replace(/^--?/, "")] = tokens[i + 1] ?? true;
        if (tokens[i + 1] !== undefined) i++;
      } else pos.push(t);
    }
    return { cmd, flags, pos };
  }

  function parseMaybe(val) {
    if (val == null || val === true) return val;
    try { return JSON.parse(val.replace(/'/g, '"')); } catch { return val; }
  }
  function idsOf(val) {
    const v = parseMaybe(val);
    if (Array.isArray(v)) return v.map(Number);
    if (typeof v === "number") return [v];
    return String(v).split(",").map((x) => Number(x.trim())).filter((n) => !Number.isNaN(n));
  }
  function fieldsOf(val) {
    const v = parseMaybe(val);
    if (Array.isArray(v)) return v;
    if (!v || v === "*") return [];
    return String(v).split(",").map((s) => s.trim()).filter(Boolean);
  }

  async function run(line) {
    const parsed = parseCmd(line);
    if (!parsed) return;
    print("in", "❯ " + line);
    try {
      const { cmd, flags, pos } = parsed;
      const model = flags.m || pos[0];
      if (cmd === "help") {
        print("muted", [
          "whoami / version / clear",
          "search -m MODEL -d DOMAIN -f F -l N",
          "read   -m MODEL -i ID[,ID] -f F",
          "count  -m MODEL -d DOMAIN",
          "fields -m MODEL",
          "call   -m MODEL -c METHOD -i ID",
          "view   -m MODEL [-i ID]",
        ].join("\n"));
        return;
      }
      if (cmd === "clear") { shadow.getElementById("out").textContent = ""; return; }
      if (cmd === "whoami") {
        const s = await getSession();
        printJson({ db: s.db, uid: s.uid, user: s.username || s.name, version: s.server_version });
        return;
      }
      if (cmd === "version") { printJson((await getSession()).server_version_info || (await getSession()).server_version); return; }
      if (cmd === "search") {
        if (!model) throw new Error("Indique un modèle (-m)");
        const domain = parseMaybe(flags.d || pos[1] || "[]");
        const fields = fieldsOf(flags.f || pos[2] || "id,display_name,name");
        printJson(await callKw(model, "search_read", [domain || [], fields], { limit: Number(flags.l || pos[3] || 20) }));
        return;
      }
      if (cmd === "read") {
        if (!model) throw new Error("Indique un modèle (-m)");
        printJson(await callKw(model, "read", [idsOf(flags.i || pos[1]), fieldsOf(flags.f || pos[2])]));
        return;
      }
      if (cmd === "count") {
        if (!model) throw new Error("Indique un modèle (-m)");
        printJson(await callKw(model, "search_count", [parseMaybe(flags.d || pos[1] || "[]") || []]));
        return;
      }
      if (cmd === "fields") {
        if (!model) throw new Error("Indique un modèle (-m)");
        const data = await callKw(model, "fields_get", [], { attributes: ["string", "type", "required", "relation"] });
        const compact = {};
        for (const [k, v] of Object.entries(data)) compact[k] = `${v.type}${v.relation ? " → " + v.relation : ""}  ${v.string || ""}`;
        printJson(compact);
        return;
      }
      if (cmd === "call") {
        if (!model) throw new Error("Indique un modèle (-m)");
        const method = flags.c || pos[1];
        if (!method) throw new Error("Indique une méthode (-c)");
        const ids = flags.i || pos[2] ? idsOf(flags.i || pos[2]) : [];
        printJson(await callKw(model, method, [ids], {}));
        return;
      }
      if (cmd === "view") {
        if (!model) throw new Error("Indique un modèle (-m)");
        const id = flags.i || pos[1];
        const u = new URL(location.href);
        const params = new URLSearchParams(u.search);
        if (!params.get("debug") || params.get("debug") === "0") params.set("debug", "1");
        const path = u.pathname.startsWith("/odoo") ? "/odoo" : "/web";
        location.href = `${u.origin}${path}?${params.toString()}#model=${model}` + (id ? `&id=${id}&view_type=form` : `&view_type=list`);
        return;
      }
      throw new Error("Commande inconnue. Tape help.");
    } catch (e) { print("err", String(e.message || e)); }
  }

  function onKey(ev) {
    const input = ev.target;
    if (ev.key === "Enter") {
      const line = input.value.trim();
      if (!line) return;
      history.push(line); histIdx = history.length; input.value = ""; run(line);
    } else if (ev.key === "ArrowUp") {
      ev.preventDefault();
      if (!history.length) return;
      histIdx = Math.max(0, histIdx - 1); input.value = history[histIdx];
    } else if (ev.key === "ArrowDown") {
      ev.preventDefault();
      histIdx = Math.min(history.length, histIdx + 1); input.value = history[histIdx] || "";
    } else if (ev.key === "Escape") hide();
  }

  document.addEventListener("keydown", (ev) => {
    if ((ev.ctrlKey || ev.metaKey) && ev.key === ",") { ev.preventDefault(); toggle(); }
  }, true);

  chrome.runtime.onMessage.addListener((msg, _s, sendResponse) => {
    if (msg?.type === "toggle-terminal") { toggle(); sendResponse({ ok: true, open }); return true; }
  });
})();
