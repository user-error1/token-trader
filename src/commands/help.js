const { PLUGIN_VERSION, BACKEND_URL } = require('../lib/config');

function run() {
  console.log(`token-trader v${PLUGIN_VERSION}

USAGE
  token-trader <command> [options]

COMMANDS
  login        Sign in with GitHub and register this device
  logout       Delete local auth + device key
  status       Show current month's credit ledger
  devices      List registered devices (--revoke <prefix> to revoke one)
  sync         Force-flush the local impression queue to the backend
  doctor       Run a health check across backend, auth, device key, queue
  help         Print this message

ENV
  TOKEN_TRADER_BACKEND_URL   backend base URL (default ${BACKEND_URL})

FILES
  ~/.token-trader/auth.json             JWT + user info
  ~/.token-trader/device.key            Ed25519 private key (0600)
  ~/.token-trader/pending-batch.jsonl   local impression queue
  ~/.token-trader/debug.log             rotated debug output (run 'doctor' to see)
`);
}

module.exports = { run };
