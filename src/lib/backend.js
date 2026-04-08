/**
 * Backend HTTP helper.
 *
 * Wraps fetch() to inject standard headers (X-Plugin-Version, Auth, Device
 * key), handle 426 Upgrade Required by exiting with a clear message, and
 * transparently retry once after a JWT refresh on 401.
 *
 * Usage:
 *   const { request } = require('../lib/backend');
 *   const { status, body } = await request('GET', '/api/v1/ledger', {}, { auth: true });
 */
const { BACKEND_URL, PLUGIN_VERSION } = require('./config');
const log = require('./log');
const auth = require('./auth');

const DEFAULT_TIMEOUT_MS = 10_000;

function buildHeaders({ authData, extra } = {}) {
  const h = {
    'Content-Type': 'application/json',
    'X-Plugin-Version': PLUGIN_VERSION,
  };
  if (authData) {
    h.Authorization = `Bearer ${authData.access_token}`;
    if (authData.public_key) h['X-Device-Key'] = authData.public_key;
  }
  return { ...h, ...(extra || {}) };
}

async function rawFetch(method, pathname, body, headers, timeoutMs) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${BACKEND_URL}${pathname}`, {
      method,
      headers,
      body: body != null ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const text = await res.text();
    let parsed;
    try { parsed = text ? JSON.parse(text) : {}; } catch (_) { parsed = { error: text }; }
    return { status: res.status, body: parsed };
  } finally {
    clearTimeout(t);
  }
}

function handle426(result) {
  if (result.status === 426) {
    const min = result.body?.min_plugin_version || '?';
    const yours = result.body?.your_version || PLUGIN_VERSION;
    console.error(`\ntoken-trader: upgrade required (you have ${yours}, backend needs ${min}).`);
    console.error(`${result.body?.hint || 'Run: cd ~/repos/token-trader && git pull'}\n`);
    process.exit(4);
  }
}

async function tryRefresh(authData) {
  try {
    const res = await rawFetch(
      'POST',
      '/api/v1/auth/refresh',
      {},
      buildHeaders({ authData }),
      DEFAULT_TIMEOUT_MS
    );
    if (res.status === 200 && res.body.access_token) {
      const next = { ...authData, access_token: res.body.access_token, expires_at: res.body.expires_at };
      auth.write(next);
      log.info('jwt refreshed');
      return next;
    }
  } catch (err) {
    log.warn(`jwt refresh failed: ${err.message}`);
  }
  return null;
}

/**
 * request(method, path, body, opts)
 *   opts.auth       — inject auth headers from ~/.token-trader/auth.json
 *   opts.authData   — explicit auth object (overrides opts.auth)
 *   opts.timeoutMs  — default 10s
 *   opts.headers    — extra request headers
 *   opts.noRefresh  — disable silent refresh on 401
 */
async function request(method, pathname, body = null, opts = {}) {
  const timeoutMs = opts.timeoutMs || DEFAULT_TIMEOUT_MS;
  let authData = opts.authData || (opts.auth ? auth.read() : null);

  let result;
  try {
    result = await rawFetch(method, pathname, body, buildHeaders({ authData, extra: opts.headers }), timeoutMs);
  } catch (err) {
    log.warn(`${method} ${pathname} failed: ${err.message}`);
    throw err;
  }

  handle426(result);

  // One-shot silent refresh on 401.
  if (result.status === 401 && authData && !opts.noRefresh) {
    const refreshed = await tryRefresh(authData);
    if (refreshed) {
      result = await rawFetch(
        method, pathname, body,
        buildHeaders({ authData: refreshed, extra: opts.headers }),
        timeoutMs
      );
      handle426(result);
    }
  }
  return result;
}

module.exports = { request, buildHeaders, DEFAULT_TIMEOUT_MS };
