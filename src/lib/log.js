/**
 * Lightweight debug log for the plugin. Everything that would be noisy on
 * stdout (failed syncs, backend timeouts, auth refresh attempts) goes here
 * instead, and `token-trader doctor` surfaces it on demand.
 *
 * Rotation: on every write, if the file is older than LOG_ROTATE_DAYS or
 * larger than LOG_MAX_BYTES, rename it to debug.log.old (single backup).
 *
 * Writes are best-effort — we never throw out of this module.
 */
const fs = require('fs');
const path = require('path');
const { LOG_PATH, HOME_DIR } = require('./paths');
const { LOG_ROTATE_DAYS, LOG_MAX_BYTES } = require('./config');

function ensureDir() {
  try {
    if (!fs.existsSync(HOME_DIR)) fs.mkdirSync(HOME_DIR, { recursive: true, mode: 0o700 });
  } catch (_) {}
}

function rotateIfNeeded() {
  try {
    if (!fs.existsSync(LOG_PATH)) return;
    const st = fs.statSync(LOG_PATH);
    const ageMs = Date.now() - st.mtimeMs;
    const ageDays = ageMs / 86400_000;
    if (ageDays >= LOG_ROTATE_DAYS || st.size >= LOG_MAX_BYTES) {
      const backup = LOG_PATH + '.old';
      try { fs.unlinkSync(backup); } catch (_) {}
      fs.renameSync(LOG_PATH, backup);
    }
  } catch (_) {}
}

function write(level, msg, extra) {
  try {
    ensureDir();
    rotateIfNeeded();
    const payload = { t: new Date().toISOString(), level, msg };
    if (extra) payload.extra = extra;
    fs.appendFileSync(LOG_PATH, JSON.stringify(payload) + '\n');
  } catch (_) {
    // Silent — log failures must not break the hot path.
  }
}

module.exports = {
  info: (msg, extra) => write('info', msg, extra),
  warn: (msg, extra) => write('warn', msg, extra),
  error: (msg, extra) => write('error', msg, extra),

  /** Read the last `n` lines of the debug log for doctor output. */
  tail(n = 20) {
    try {
      if (!fs.existsSync(LOG_PATH)) return [];
      const text = fs.readFileSync(LOG_PATH, 'utf-8');
      const lines = text.trim().split('\n').filter(Boolean);
      return lines.slice(-n).map((l) => { try { return JSON.parse(l); } catch { return { raw: l }; } });
    } catch (_) {
      return [];
    }
  },

  _logPath: LOG_PATH,
};
