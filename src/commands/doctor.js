/**
 * token-trader doctor
 *
 * Health check across every invariant the plugin depends on. Each check
 * is independent; failures are reported but don't stop other checks from
 * running. Exits 0 if all pass, 1 if any fail, 2 if any warn.
 *
 * Chunk 1: offline checks only (auth file, device key, queue, fallback
 * inventory, debug log). Chunk 2 will add network checks (backend
 * reachable, auth valid, plugin version up-to-date).
 */
const fs = require('fs');
const path = require('path');
const {
  AUTH_PATH,
  DEVICE_KEY_PATH,
  LOCAL_ADS_PATH,
  LOG_PATH,
} = require('../lib/paths');
const { BACKEND_URL, PLUGIN_VERSION, AD_FETCH_TIMEOUT_MS, QUEUE_HARD_CAP } = require('../lib/config');
const queue = require('../lib/queue');
const log = require('../lib/log');
const { request } = require('../lib/backend');

const PASS = 'ok  ';
const WARN = 'warn';
const FAIL = 'fail';

function result(status, label, detail) {
  return { status, label, detail };
}

function checkAuth() {
  if (!fs.existsSync(AUTH_PATH)) {
    return result(FAIL, 'Auth token', 'not signed in — run `token-trader login`');
  }
  try {
    const auth = JSON.parse(fs.readFileSync(AUTH_PATH, 'utf-8'));
    if (!auth.access_token) {
      return result(FAIL, 'Auth token', 'auth.json present but no access_token');
    }
    const who = auth.user?.github_username ? `@${auth.user.github_username}` : '(unknown user)';
    // expires_at is stored as Unix seconds; Date expects ms.
    const expires = auth.expires_at ? new Date(auth.expires_at * 1000).toISOString().slice(0, 10) : 'unknown';
    return result(PASS, 'Auth token', `${who}, expires ${expires}`);
  } catch (err) {
    return result(FAIL, 'Auth token', `unreadable: ${err.message}`);
  }
}

function checkDeviceKey() {
  if (!fs.existsSync(DEVICE_KEY_PATH)) {
    return result(FAIL, 'Device key', 'missing — run `token-trader login`');
  }
  try {
    const st = fs.statSync(DEVICE_KEY_PATH);
    const mode = (st.mode & 0o777).toString(8);
    if (mode !== '600') {
      return result(WARN, 'Device key', `present but mode is ${mode} (should be 600)`);
    }
    return result(PASS, 'Device key', `present, mode 600`);
  } catch (err) {
    return result(FAIL, 'Device key', `stat failed: ${err.message}`);
  }
}

function checkQueue() {
  const n = queue.size();
  if (n === 0) return result(PASS, 'Impression queue', 'empty');
  if (n >= QUEUE_HARD_CAP * 0.9) {
    return result(WARN, 'Impression queue', `${n} pending (near hard cap of ${QUEUE_HARD_CAP})`);
  }
  return result(PASS, 'Impression queue', `${n} pending`);
}

function checkInventory() {
  try {
    const ads = JSON.parse(fs.readFileSync(LOCAL_ADS_PATH, 'utf-8'));
    if (!Array.isArray(ads) || ads.length === 0) {
      return result(FAIL, 'Fallback inventory', 'ads.json empty or malformed');
    }
    return result(PASS, 'Fallback inventory', `${ads.length} ads in ads.json`);
  } catch (err) {
    return result(FAIL, 'Fallback inventory', `unreadable: ${err.message}`);
  }
}

function checkDebugLog() {
  if (!fs.existsSync(LOG_PATH)) {
    return result(PASS, 'Debug log', 'no errors logged');
  }
  const tail = log.tail(5);
  const recentErrors = tail.filter((e) => e.level === 'error').length;
  if (recentErrors > 0) {
    return result(WARN, 'Debug log', `${recentErrors} recent errors (tail at ${LOG_PATH})`);
  }
  return result(PASS, 'Debug log', `${tail.length} recent entries, no errors`);
}

async function checkBackend() {
  const start = Date.now();
  try {
    const res = await request('GET', '/api/v1/health', null, { timeoutMs: 3000 });
    const elapsed = Date.now() - start;
    if (res.status !== 200) {
      return result(FAIL, 'Backend reachable', `HTTP ${res.status} from ${BACKEND_URL}`);
    }
    const minVer = res.body?.min_plugin_version;
    if (minVer && PLUGIN_VERSION !== minVer) {
      // rough "needs upgrade" hint — real gate is enforced by 426 on other endpoints
      const [a, b] = [PLUGIN_VERSION, minVer].map((v) => v.split('.').map(Number));
      const stale =
        a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]) ||
        (a[0] === b[0] && a[1] === b[1] && a[2] < b[2]);
      if (stale) {
        return result(WARN, 'Backend reachable', `${elapsed}ms — UPGRADE AVAILABLE (min ${minVer}, you ${PLUGIN_VERSION})`);
      }
    }
    return result(PASS, 'Backend reachable', `${elapsed}ms (${BACKEND_URL})`);
  } catch (err) {
    return result(FAIL, 'Backend reachable', `${err.message}`);
  }
}

function checkStatusLine() {
  const pluginRoot = path.resolve(__dirname, '..', '..');
  const settingsPath = path.join(
    process.env.HOME || process.env.USERPROFILE,
    '.claude',
    'settings.json'
  );

  let settings = {};
  try {
    settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
  } catch (_) {
    return result(FAIL, 'Status line', '~/.claude/settings.json missing or unreadable');
  }

  if (!settings.statusLine) {
    return result(FAIL, 'Status line', 'not configured — run `token-trader login` or re-login to fix');
  }

  if (!settings.statusLine.command || !settings.statusLine.command.includes('statusline-ad.js')) {
    return result(WARN, 'Status line', 'configured but not pointing to token-trader');
  }

  // Check if the referenced script actually exists.
  const match = settings.statusLine.command.match(/node\s+(.+\/statusline-ad\.js)/);
  if (match && !fs.existsSync(match[1])) {
    return result(FAIL, 'Status line', `script not found at ${match[1]} — plugin path may be stale`);
  }

  return result(PASS, 'Status line', 'configured');
}

async function checkAuthLive() {
  if (!fs.existsSync(AUTH_PATH)) {
    return result(WARN, 'Auth live check', 'skipped — not signed in');
  }
  try {
    const res = await request('GET', '/api/v1/auth/me', null, { auth: true, timeoutMs: 3000 });
    if (res.status === 200) {
      const n = (res.body.devices || []).length;
      return result(PASS, 'Auth live check', `valid, ${n} active device${n === 1 ? '' : 's'}`);
    }
    if (res.status === 401) return result(FAIL, 'Auth live check', 'backend says token is invalid — run `token-trader login`');
    return result(WARN, 'Auth live check', `HTTP ${res.status}`);
  } catch (err) {
    return result(WARN, 'Auth live check', `network error: ${err.message}`);
  }
}

async function run() {
  console.log(`token-trader v${PLUGIN_VERSION}  backend: ${BACKEND_URL}`);
  console.log('');

  const checks = [
    checkAuth(),
    checkDeviceKey(),
    checkStatusLine(),
    checkQueue(),
    checkInventory(),
    checkDebugLog(),
    await checkBackend(),
    await checkAuthLive(),
  ];

  let worst = PASS;
  for (const c of checks) {
    const badge =
      c.status === PASS ? '[\x1b[32mok\x1b[0m]' :
      c.status === WARN ? '[\x1b[33m!!\x1b[0m]' :
                          '[\x1b[31mxx\x1b[0m]';
    console.log(`  ${badge} ${c.label.padEnd(20)} ${c.detail}`);
    if (c.status === FAIL) worst = FAIL;
    else if (c.status === WARN && worst !== FAIL) worst = WARN;
  }

  const fails = checks.filter((c) => c.status === FAIL).length;
  const warns = checks.filter((c) => c.status === WARN).length;
  const passes = checks.length - fails - warns;

  console.log('');
  console.log(`Overall: ${passes}/${checks.length} passed${warns ? `, ${warns} warn` : ''}${fails ? `, ${fails} fail` : ''}`);

  if (worst === FAIL) process.exit(1);
  if (worst === WARN) process.exit(2);
  process.exit(0);
}

module.exports = { run };
