# Odoo Debug+

Extension Chrome / Edge / Brave pour intégrateurs Odoo.

- Version Odoo sur le badge de l’icône (`18.0`, `17.0`…)
- Switch debug / assets / tests
- Terminal JSON-RPC dans la page
- Accès rapide : backend, site, sélecteur et manager de bases, login

Ce projet n’est pas affilié à Odoo S.A.

## Installation

1. Clone ce dépôt
2. Ouvre `chrome://extensions`
3. Active **Mode développeur**
4. **Charger l’extension non empaquetée** → dossier du clone

Si les icônes manquent : `python3 generate_icons.py`

## Utilisation

| Action | Effet |
|---|---|
| Badge | Version courte |
| Clic sur l’icône | Panneau |
| Switch | `?debug=1` / `?debug=0` |
| Debug / Assets / Tests | Mode correspondant |
| Terminal | Overlay JSON-RPC |
| `Ctrl` / `⌘` + `.` | Toggle debug |
| `Ctrl` / `⌘` + `Shift` + `.` | Toggle assets |
| `Ctrl` / `⌘` + `,` | Toggle terminal |

### Terminal

```
help
whoami
version
search -m res.partner -f name,email -l 10
read -m res.users -i 2 -f name,login
count -m sale.order
fields -m res.partner
call -m sale.order -c action_confirm -i 12
view -m res.partner -i 5
clear
```

Les appels passent par `/web/dataset/call_kw` avec la session du navigateur.
