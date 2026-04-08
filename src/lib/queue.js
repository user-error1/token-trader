/**
 * Local impression queue.
 *
 * On-disk format: one JSON object per line in `pending-batch.jsonl`.
 * Append-only during normal operation; rewritten atomically during
 * ack (truncate up to the last successfully-synced line) and during
 * hard-cap eviction (drop oldest N lines).
 *
 * Invariants:
 *   - enqueue is append-only and O(1)
 *   - size() reads the file once to count newlines
 *   - ackHead(n) rewrites the file excluding the first n lines
 *   - evictToCap() keeps the newest QUEUE_HARD_CAP entries (FIFO drop)
 *   - All operations are best-effort — they log errors but do not throw
 */
const fs = require('fs');
const path = require('path');
const { QUEUE_PATH, HOME_DIR } = require('./paths');
const { QUEUE_HARD_CAP } = require('./config');
const log = require('./log');

function ensureDir() {
  try {
    if (!fs.existsSync(HOME_DIR)) fs.mkdirSync(HOME_DIR, { recursive: true, mode: 0o700 });
  } catch (_) {}
}

function readAllLines() {
  try {
    if (!fs.existsSync(QUEUE_PATH)) return [];
    return fs.readFileSync(QUEUE_PATH, 'utf-8').split('\n').filter((l) => l.length > 0);
  } catch (err) {
    log.error('queue read failed', { err: String(err) });
    return [];
  }
}

function writeAllLines(lines) {
  ensureDir();
  const tmp = QUEUE_PATH + '.tmp';
  try {
    fs.writeFileSync(tmp, lines.length ? lines.join('\n') + '\n' : '', { mode: 0o600 });
    fs.renameSync(tmp, QUEUE_PATH);
  } catch (err) {
    log.error('queue write failed', { err: String(err) });
    try { fs.unlinkSync(tmp); } catch (_) {}
  }
}

/**
 * Append a signed impression to the queue. Triggers hard-cap eviction
 * (FIFO, drops oldest) if the queue exceeds QUEUE_HARD_CAP.
 */
function enqueue(impression) {
  ensureDir();
  try {
    fs.appendFileSync(QUEUE_PATH, JSON.stringify(impression) + '\n', { mode: 0o600 });
  } catch (err) {
    log.error('queue enqueue failed', { err: String(err) });
    return;
  }
  // Lazy hard-cap check: only rewrites when we cross the boundary.
  const n = size();
  if (n > QUEUE_HARD_CAP) {
    evictToCap();
  }
}

/** Return the current number of queued impressions. */
function size() {
  return readAllLines().length;
}

/** Return the first `n` impressions without removing them. */
function peek(n) {
  const lines = readAllLines();
  return lines.slice(0, n).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}

/** Return all queued impressions (parsed). Use for small queues / tests. */
function readAll() {
  return readAllLines().map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}

/**
 * Remove the first `n` lines from the queue. Called after a successful
 * batch POST acks the first n impressions.
 */
function ackHead(n) {
  if (n <= 0) return;
  const lines = readAllLines();
  if (n >= lines.length) {
    writeAllLines([]);
    return;
  }
  writeAllLines(lines.slice(n));
}

/** Clear the queue entirely. */
function clear() {
  writeAllLines([]);
}

/**
 * Enforce the hard cap by dropping the OLDEST entries, keeping the
 * newest QUEUE_HARD_CAP. FIFO drop — losing old impressions hurts less
 * than losing recent activity.
 */
function evictToCap() {
  const lines = readAllLines();
  if (lines.length <= QUEUE_HARD_CAP) return;
  const keep = lines.slice(lines.length - QUEUE_HARD_CAP);
  const dropped = lines.length - keep.length;
  writeAllLines(keep);
  log.warn('queue hard-cap eviction', { dropped, kept: keep.length, cap: QUEUE_HARD_CAP });
}

module.exports = {
  enqueue,
  size,
  peek,
  readAll,
  ackHead,
  clear,
  evictToCap,
  _path: QUEUE_PATH,
};
