/**
 * TokenTrader plugin configuration.
 *
 * BACKEND_URL defaults to production Fly.io. Override for local dev:
 *   TOKEN_TRADER_BACKEND_URL=http://localhost:3000 token-trader doctor
 *
 * PLUGIN_VERSION is sent as X-Plugin-Version on every request. The backend
 * enforces a minimum version via a middleware that returns 426 Upgrade
 * Required for older clients (see Phase 7 Step 8).
 */
const pkg = require('../../package.json');

const DEFAULT_BACKEND = 'https://token-trader-api.fly.dev';

function stripTrailingSlash(u) {
  return u.replace(/\/+$/, '');
}

module.exports = {
  BACKEND_URL: stripTrailingSlash(process.env.TOKEN_TRADER_BACKEND_URL || DEFAULT_BACKEND),
  PLUGIN_VERSION: pkg.version,

  // Hot-path ad fetch timeout — Phase 7 Step 7 rule: no blocking network.
  AD_FETCH_TIMEOUT_MS: 500,

  // Queue safety limits
  QUEUE_HARD_CAP: 10_000,

  // Sync behavior
  SYNC_PERIODIC_MS: 5 * 60 * 1000, // 5 min
  SYNC_QUEUE_TRIGGER: 50,          // flush if queue exceeds this

  // Backoff sequence for sync failures (ms)
  SYNC_BACKOFF_MS: [30_000, 5 * 60_000, 30 * 60_000],

  // Debug log rotation
  LOG_ROTATE_DAYS: 7,
  LOG_MAX_BYTES: 1_000_000,
};
