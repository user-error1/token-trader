#!/bin/bash
# TokenTrader — install.sh
#
# Registers the plugin with Claude Code by:
#   1. Symlinking ~/repos/token-trader into ~/.claude/plugins/token-trader
#   2. Adding the Stop hook to ~/.claude/settings.json
#
# Safe to run multiple times (idempotent).

set -euo pipefail

# ── 0. Ensure node + npm are available ───────────────────────────────────────
ensure_node() {
  if command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1; then
    return 0
  fi
  echo "node/npm not found — attempting to install..."
  case "$(uname -s)" in
    Darwin)
      if ! command -v brew >/dev/null 2>&1; then
        echo "ERROR: Homebrew not installed. Install it from https://brew.sh then re-run."
        exit 1
      fi
      brew install node
      ;;
    Linux)
      if command -v apt-get >/dev/null 2>&1; then
        sudo apt-get update && sudo apt-get install -y nodejs npm
      elif command -v dnf >/dev/null 2>&1; then
        sudo dnf install -y nodejs npm
      elif command -v pacman >/dev/null 2>&1; then
        sudo pacman -S --noconfirm nodejs npm
      else
        echo "ERROR: No supported package manager found. Install Node.js manually from https://nodejs.org"
        exit 1
      fi
      ;;
    *)
      echo "ERROR: Unsupported OS. Install Node.js manually from https://nodejs.org"
      exit 1
      ;;
  esac
  if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
    echo "ERROR: node/npm still not found after install attempt."
    exit 1
  fi
}
ensure_node

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

# ── 4. Link the token-trader CLI globally ────────────────────────────────────
echo ""
echo "Linking token-trader CLI..."
(cd "$PLUGIN_DIR" && npm link)

echo ""
echo "TokenTrader installed. Restart Claude Code to activate."
echo "Next: run 'token-trader login' to sign in with GitHub."
echo "Impression log: ~/.token-trader/impressions.json"
