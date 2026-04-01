#!/bin/bash
# TokenTrader entry point — called by the UserPromptSubmit hook.
# Forwards stdin to show-ad.js and exits cleanly.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec node "$SCRIPT_DIR/show-ad.js"
