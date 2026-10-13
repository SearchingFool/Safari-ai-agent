#!/bin/bash
# Double-click in Finder. Install once, then reopen the same control panel.
set -euo pipefail
cd "$(dirname "$0")"
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
echo 'Opening Safari Gateway controls…'
echo 'Login username: safari-control'
echo 'The separate control password will be copied to your clipboard. Paste it into the browser login.'
node tools/install-gateway-controls.mjs --open
