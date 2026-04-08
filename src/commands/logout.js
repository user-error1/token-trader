/**
 * token-trader logout
 *
 * Delete auth.json and device.key. The fingerprint stays — it's machine
 * identity, not account identity, so a future login from this machine
 * re-uses it (and re-registers the same device row).
 */
const fs = require('fs');
const auth = require('../lib/auth');
const { DEVICE_KEY_PATH } = require('../lib/paths');

function run() {
  const had = !!auth.read();
  auth.clear();
  try { fs.unlinkSync(DEVICE_KEY_PATH); } catch (_) {}
  if (had) console.log('Signed out. Local auth and device key deleted.');
  else console.log('No active session. (Nothing to do.)');
}

module.exports = { run };
