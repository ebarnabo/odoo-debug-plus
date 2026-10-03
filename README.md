# Odoo Debug+

Extension Chrome / Edge / Brave / Firefox / Zen pour intégrateurs Odoo.

- Version Odoo sur le badge de l’icône (`18.0`, `17.0`…)
- Switch debug / assets / tests
- Terminal JSON-RPC dans la page
- Accès rapide : backend, site, sélecteur et manager de bases, login

Ce projet n’est pas affilié à Odoo S.A.

## Installation

Si les icônes manquent : `python3 generate_icons.py`

### Chrome / Edge / Brave

1. Clone ce dépôt
2. Ouvre `chrome://extensions` (ou `edge://extensions`)
3. Active **Mode développeur**
4. **Charger l’extension non empaquetée** → dossier du clone

### Firefox / Zen

1. Clone ce dépôt
2. Ouvre `about:debugging#/runtime/this-firefox`
3. **Charger un module complémentaire temporaire**
4. Choisis `manifest-firefox.json` dans le dossier du clone (recommandé sur Zen)
5. Épingle l’icône dans la barre d’outils

L’extension reste chargée jusqu’au redémarrage du navigateur.

Pour la garder après redémarrage (non signée) :

1. `about:config` → `xpinstall.signatures.required` → `false`
2. `about:addons` → la roue → **Installer un module depuis un fichier**
3. Choisis le fichier `.xpi` (voir plus bas)

#### Paquet `.xpi`

Depuis la racine du dépôt :

```powershell
$stage = Join-Path $env:TEMP "odoo-debug-plus-xpi"
Remove-Item $stage -Recurse -Force -ErrorAction SilentlyContinue
New-Item $stage -ItemType Directory | Out-Null
Copy-Item manifest-firefox.json (Join-Path $stage "manifest.json")
Copy-Item background.js,content.js,page-bridge.js,popup.html,popup.js,popup.css,terminal.js $stage
Copy-Item icons $stage -Recurse
Compress-Archive -Force -Path "$stage\*" -DestinationPath odoo-debug-plus.zip
Rename-Item -Force odoo-debug-plus.zip odoo-debug-plus.xpi
```

## Utilisation

| Action | Effet |
|---|---|
| Badge | Version courte |
| Clic gauche sur l’icône | Active ou désactive le mode développeur |
| Clic droit | Panneau (Firefox / Zen : popup ; Chrome : menu d’options) |
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
