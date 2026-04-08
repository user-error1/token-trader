#!/usr/bin/env node
/**
 * TokenTrader — show-ad.js
 *
 * Claude Code Stop hook. On every assistant response:
 *   1. Build a signed + PoW-solved impression from the latest displayed ad's
 *      nonce and append it to the local queue.
 *   2. Consider whether to drain the queue to the backend, using Phase 7's
 *      sync engine (respects backoff schedule on failure).
 *
 * Triggers for a drain attempt:
 *   - queue size >= SYNC_QUEUE_TRIGGER  (opportunistic)
 *   - elapsed since last success >= SYNC_PERIODIC_MS  (periodic tick)
 *
 * Never blocks the user: all failures are silent and logged to debug.log.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const { signPayload } = require('./lib/device-key');
const { solvePoW } = require('./lib/pow-solver');
const queue = require('../src/lib/queue');
const auth = require('../src/lib/auth');
const log = require('../src/lib/log');
const { drainQueue, readState } = require('../src/lib/sync');
const { SYNC_PERIODIC_MS, SYNC_QUEUE_TRIGGER } = require('../src/lib/config');
const { NONCE_PATH } = require('../src/lib/paths');

// Read hook data from stdin
let hookData = {};
try {
  const input = fs.readFileSync(0, 'utf8');
  if (input.trim()) hookData = JSON.parse(input);
} catch (_) {}

const sessionId = hookData.session_id || 'unknown';

function getLatestNonce() {
  try {
    if (!fs.existsSync(NONCE_PATH)) return null;
    const lines = fs.readFileSync(NONCE_PATH, 'utf-8').trim().split('\n').filter(Boolean);
    if (lines.length === 0) return null;
    return JSON.parse(lines[lines.length - 1]);
  } catch (_) { return null; }
}

function createImpression() {
  const nonce = getLatestNonce();
  if (!nonce) return false;

  let powSolution;
  try {
    powSolution = solvePoW(nonce.pow_nonce);
  } catch (err) {
    log.warn(`PoW solve failed: ${err.message}`);
    return false;
  }

  const timestamp = new Date().toISOString();
  const payload = `${nonce.ad_id}|${sessionId}|${timestamp}|${nonce.pow_nonce}`;
  const signature = signPayload(payload);

  queue.enqueue({
    ad_id: nonce.ad_id,
    session_id: sessionId,
    timestamp,
    pow_nonce: nonce.pow_nonce,
    pow_solution: powSolution,
    signature,
    metadata: {
      response_tokens: hookData.response?.output_tokens ?? null,
      dwell_time_ms: null,
      window_focused: true,
      session_duration_s: hookData.session_duration_s ?? null,
    },
  });
  return true;
}

function shouldAttemptSync() {
  if (queue.size() >= SYNC_QUEUE_TRIGGER) return 'queue_size';
  const state = readState();
  const elapsed = Date.now() - (state.last_success_at || 0);
  if (elapsed >= SYNC_PERIODIC_MS) return 'periodic';
  return null;
}

(async () => {
  createImpression();

  const trigger = shouldAttemptSync();
  if (!trigger) return;

  const authData = auth.read();
  if (!authData) return; // Not signed in — nothing to sync yet.

  try {
    await drainQueue({ authData, trigger });
  } catch (err) {
    log.warn(`show-ad sync error: ${err.message}`);
  }
})().catch(() => {}).finally(() => process.exit(0));
