/**
 * Auth file helpers — read/write ~/.token-trader/auth.json.
 */
const fs = require('fs');
const path = require('path');
const { AUTH_PATH } = require('./paths');

function read() {
  try {
    if (!fs.existsSync(AUTH_PATH)) return null;
    const data = JSON.parse(fs.readFileSync(AUTH_PATH, 'utf-8'));
    if (!data.access_token) return null;
    return data;
  } catch (_) {
    return null;
  }
}

function write(data) {
  fs.mkdirSync(path.dirname(AUTH_PATH), { recursive: true });
  fs.writeFileSync(AUTH_PATH, JSON.stringify(data, null, 2), { mode: 0o600 });
}

function clear() {
  try { fs.unlinkSync(AUTH_PATH); } catch (_) {}
}

function require_() {
  const auth = read();
  if (!auth) {
    console.error('Not signed in. Run: token-trader login');
    process.exit(1);
  }
  return auth;
}

module.exports = { read, write, clear, require: require_ };
