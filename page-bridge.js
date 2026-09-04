(() => {
  try {
    const info = {};
    const odoo = window.odoo;
    const session =
      (odoo && (odoo.__session_info__ || odoo.session_info || odoo.session)) ||
      window.__session_info__ ||
      null;

    if (session && typeof session === "object") {
      info.server_version = session.server_version || null;
      info.server_version_info = session.server_version_info || null;
      info.db = session.db || null;
      info.uid = session.uid || session.user_id || null;
      info.name = session.name || session.username || null;
      info.isOdoo = true;
    }

    if (odoo) info.isOdoo = true;
    if (document.body && /o_web_client|o_home_menu|o_action_manager/.test(document.body.className)) {
      info.isOdoo = true;
    }

    window.postMessage({ source: "odoo-debug-plus", type: "session", info }, "*");
  } catch (e) {
    window.postMessage({ source: "odoo-debug-plus", type: "session", info: { error: String(e) } }, "*");
  }
})();
