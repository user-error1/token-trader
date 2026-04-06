#!/bin/bash
# TokenTrader — install.sh
#
# Registers the plugin with Claude Code by:
#   1. Symlinking ~/repos/token-trader into ~/.claude/plugins/token-trader
#   2. Adding the Stop hook to ~/.claude/settings.json
#
# Safe to run multiple times (idempotent).

set -euo pipefail

PLUGIN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLAUDE_DIR="$HOME/.claude"
PLUGINS_DIR="$CLAUDE_DIR/plugins"
SETTINGS_FILE="$CLAUDE_DIR/settings.json"
HOOK_COMMAND="$PLUGIN_DIR/scripts/show-ad.sh"
STATUSLINE_COMMAND="node $PLUGIN_DIR/scripts/statusline-ad.js"

# ── 1. Symlink into ~/.claude/plugins/ ────────────────────────────────────────
mkdir -p "$PLUGINS_DIR"
LINK="$PLUGINS_DIR/token-trader"
if [ -L "$LINK" ]; then
  echo "Plugin symlink already exists: $LINK"
elif [ -e "$LINK" ]; then
  echo "ERROR: $LINK exists but is not a symlink. Remove it manually and re-run."
  exit 1
else
  ln -s "$PLUGIN_DIR" "$LINK"
  echo "Created symlink: $LINK -> $PLUGIN_DIR"
fi

# ── 2. Patch ~/.claude/settings.json ──────────────────────────────────────────
# Requires node (available wherever Claude Code runs).

node - "$SETTINGS_FILE" "$HOOK_COMMAND" "$STATUSLINE_COMMAND" <<'EOF'
const fs = require('fs');
const path = require('path');

const settingsPath = process.argv[2];
const hookCommand = process.argv[3];
const statusLineCommand = process.argv[4];

let settings = {};
if (fs.existsSync(settingsPath)) {
  try {
    settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  } catch (e) {
    console.error('ERROR: Could not parse', settingsPath, '—', e.message);
    process.exit(1);
  }
}

if (!settings.hooks) settings.hooks = {};

// Remove any legacy hooks from previous installs
for (const event of ['UserPromptSubmit', 'PermissionRequest']) {
  if (settings.hooks[event]) {
    settings.hooks[event] = settings.hooks[event].filter(group =>
      !(Array.isArray(group.hooks) && group.hooks.some(h => h.command === hookCommand))
    );
    if (settings.hooks[event].length === 0) delete settings.hooks[event];
  }
}

if (!settings.hooks.Stop) settings.hooks.Stop = [];

// Check if our hook is already registered
const alreadyRegistered = settings.hooks.Stop.some(group =>
  Array.isArray(group.hooks) &&
  group.hooks.some(h => h.command === hookCommand)
);

if (alreadyRegistered) {
  console.log('Hook already registered in', settingsPath);
  process.exit(0);
}

settings.hooks.Stop.push({
  hooks: [
    {
      type: 'command',
      command: hookCommand
    }
  ]
});

// Register statusLine for persistent ad display
settings.statusLine = {
  type: 'command',
  command: statusLineCommand
};

fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n', 'utf8');
console.log('Hook and statusLine registered in', settingsPath);
EOF

# ── 3. Generate device keypair + fingerprint ──────────────────────────────────
echo ""
echo "Setting up device identity..."
node "$PLUGIN_DIR/scripts/lib/generate-key.js"
chmod 600 "$HOME/.token-trader/device.key" 2>/dev/null || true

echo ""
echo "TokenTrader installed. Restart Claude Code to activate."
echo "Next: run 'node $PLUGIN_DIR/scripts/auth.js' to sign in with GitHub."
echo "Impression log: ~/.token-trader/impressions.json"
