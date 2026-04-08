/**
 * Sync engine — drains the local impression queue to the backend,
 * respecting a failure backoff schedule.
 *
 * Backoff: consecutive failures walk through SYNC_BACKOFF_MS
 *   [30s, 5min, 30min]; index clamps at the last value, so from the
 *   3rd failure onward we retry every 30 minutes, forever. We never
 *   drop impressions due to backend unavailability — only due to the
 *   queue's own hard cap (FIFO eviction, handled in queue.js).
 *
 * State file at SYNC_STATE_PATH:
 *   {
 *     last_success_at: <epoch ms>,
 *     last_attempt_at: <epoch ms>,
 *     failure_count: <int>,
 *     next_retry_at: <epoch ms>
 *   }
 *
 * Callers should use drainQueue({ auth, trigger }) — opts.trigger is
 * 'manual' | 'periodic' | 'queue_size' (for logging only).  When the
 * trigger is 'manual', the backoff gate is bypassed.
 */
const fs = require('fs');
const path = require('path');
const { SYNC_STATE_PATH } = require('./paths');
const { SYNC_BACKOFF_MS } = require('./config');
const queue = require('./queue');
const log = require('./log');
const { request } = require('./backend');

const BATCH_SIZE = 50;

function readState() {
  try {
    return JSON.parse(fs.readFileSync(SYNC_STATE_PATH, 'utf-8'));
  } catch (_) {
    return { last_success_at: 0, last_attempt_at: 0, failure_count: 0, next_retry_at: 0 };
  }
}

function writeState(state) {
  try {
    fs.mkdirSync(path.dirname(SYNC_STATE_PATH), { recursive: true });
    fs.writeFileSync(SYNC_STATE_PATH, JSON.stringify(state));
  } catch (_) {}
}

function nextRetryFromFailureCount(n) {
  const idx = Math.min(n - 1, SYNC_BACKOFF_MS.length - 1);
  return Date.now() + SYNC_BACKOFF_MS[Math.max(0, idx)];
}

function recordSuccess() {
  writeState({
    last_success_at: Date.now(),
    last_attempt_at: Date.now(),
    failure_count: 0,
    next_retry_at: 0,
  });
}

function recordFailure(prev) {
  const failure_count = (prev.failure_count || 0) + 1;
  writeState({
    last_success_at: prev.last_success_at || 0,
    last_attempt_at: Date.now(),
    failure_count,
    next_retry_at: nextRetryFromFailureCount(failure_count),
  });
  return failure_count;
}

/**
 * Drain the local queue to the backend.
 *
 * @param {Object} opts
 * @param {Object} opts.authData   Parsed ~/.token-trader/auth.json
 * @param {string} opts.trigger    'manual' | 'periodic' | 'queue_size' | 'session_end'
 * @returns {Promise<{ sent: number, rejected: number, status: 'ok'|'empty'|'backoff'|'error' }>}
 */
async function drainQueue({ authData, trigger = 'manual' } = {}) {
  if (!authData) return { sent: 0, rejected: 0, status: 'error' };
  if (queue.size() === 0) return { sent: 0, rejected: 0, status: 'empty' };

  const state = readState();
  if (trigger !== 'manual' && state.next_retry_at && Date.now() < state.next_retry_at) {
    return { sent: 0, rejected: 0, status: 'backoff' };
  }

  let sent = 0;
  let rejected = 0;

  while (queue.size() > 0) {
    const batch = queue.peek(BATCH_SIZE);
    let res;
    try {
      res = await request(
        'POST',
        '/api/v1/impressions/batch',
        { batch },
        { authData, timeoutMs: 15_000 }
      );
    } catch (err) {
      const count = recordFailure(state);
      log.warn(`sync failed trigger=${trigger} err=${err.message} failure_count=${count} queue=${queue.size()}`);
      return { sent, rejected, status: 'error' };
    }

    if (res.status !== 200) {
      const count = recordFailure(state);
      log.warn(`sync failed trigger=${trigger} status=${res.status} failure_count=${count} queue=${queue.size()}`);
      return { sent, rejected, status: 'error' };
    }

    queue.ackHead(batch.length);
    sent += batch.length;
    if (Array.isArray(res.body?.rejections)) rejected += res.body.rejections.length;
  }

  recordSuccess();
  log.info(`sync ok trigger=${trigger} sent=${sent} rejected=${rejected}`);
  return { sent, rejected, status: 'ok' };
}

module.exports = { drainQueue, readState, BATCH_SIZE };
