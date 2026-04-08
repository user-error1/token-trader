/**
 * Central file paths for the TokenTrader plugin.
 *
 * Everything the plugin persists lives under ~/.token-trader/ (0700).
 * Bundled inventory (ads.json) lives inside the plugin repo itself.
 */
const os = require('os');
const path = require('path');

const HOME_DIR = path.join(os.homedir(), '.token-trader');
const PLUGIN_ROOT = path.resolve(__dirname, '..', '..');

module.exports = {
  HOME_DIR,
  PLUGIN_ROOT,

  // Persistent state
  AUTH_PATH: path.join(HOME_DIR, 'auth.json'),
  DEVICE_KEY_PATH: path.join(HOME_DIR, 'device.key'),
  FINGERPRINT_PATH: path.join(HOME_DIR, 'fingerprint.txt'),

  // Local queue (impressions awaiting sync) — append-only JSONL.
  // Named 'pending-batch.jsonl' to stay compatible with the Phase 3 file layout.
  QUEUE_PATH: path.join(HOME_DIR, 'pending-batch.jsonl'),

  // Nonce log — maps displayed ad → backend-issued PoW nonce.
  NONCE_PATH: path.join(HOME_DIR, 'pow-nonces.jsonl'),

  // Ad cache from last successful /ads/next
  CACHE_PATH: path.join(HOME_DIR, 'cached-ad.json'),

  // Debug log (rotated weekly)
  LOG_PATH: path.join(HOME_DIR, 'debug.log'),

  // State files
  SYNC_STATE_PATH: path.join(HOME_DIR, 'last-sync.json'),
  SESSION_STATE_PATH: path.join(HOME_DIR, 'session-state.json'),

  // Bundled inventory (fallback when backend is unreachable and no cache exists)
  LOCAL_ADS_PATH: path.join(PLUGIN_ROOT, 'scripts', 'ads.json'),
};
