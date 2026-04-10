const { PLUGIN_VERSION, BACKEND_URL } = require('../lib/config');

function run() {
  console.log(`token-trader v${PLUGIN_VERSION}

USAGE
  /token-trader:<command> [options]

COMMANDS
  /token-trader:login        Sign in with GitHub and register this device
  /token-trader:logout       Delete local auth + device key
  /token-trader:status       Show current month's credit ledger
  /token-trader:devices      List registered devices (--revoke <prefix> to revoke one)
  /token-trader:sync         Force-flush the local impression queue to the backend
  /token-trader:doctor       Run a health check across backend, auth, device key, queue
  /token-trader:help         Print this message

ENV
  TOKEN_TRADER_BACKEND_URL   backend base URL (default ${BACKEND_URL})

FILES
  ~/.token-trader/auth.json             JWT + user info
  ~/.token-trader/device.key            Ed25519 private key (0600)
  ~/.token-trader/pending-batch.jsonl   local impression queue
  ~/.token-trader/debug.log             rotated debug output (run '/token-trader:doctor' to see)
`);
}

module.exports = { run };
