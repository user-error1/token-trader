#!/bin/bash
# TokenTrader — install.sh (OPTIONAL)
#
# You do NOT need this script for normal use. The Claude Code plugin handles
# everything on its own — install it from inside Claude Code with:
#
#   /plugin marketplace add user-error1/token-trader
#   /plugin install token-trader@token-trader-local
#
# This script only exists for power users who want the `token-trader` binary
# available in a regular terminal (outside Claude Code). It will:
#   1. Verify node + npm are installed (and install them if missing)
#   2. `npm link` the token-trader CLI onto your $PATH
#
# The device keypair is generated lazily on first `token-trader login`, so
# this script does not touch ~/.token-trader.
#
# Safe to run multiple times (idempotent).

set -euo pipefail

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

echo "Linking token-trader CLI..."
(cd "$PLUGIN_DIR" && npm link)

echo ""
echo "Done. 'token-trader' is now available in your terminal."
echo ""
echo "Remember: the Claude Code plugin is a separate install. From inside Claude Code:"
echo "  /plugin marketplace add user-error1/token-trader"
echo "  /plugin install token-trader@token-trader-local"
