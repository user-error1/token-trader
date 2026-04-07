#!/usr/bin/env node
/**
 * TokenTrader — show-ad.js (Phase 3)
 *
 * Stop hook. Signs and queues an impression for the last displayed ad,
 * then syncs the pending batch to the backend when the batch is large
 * enough or enough time has passed since the last sync.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const { signPayload, getPublicKeyBase64 } = require('./lib/device-key');
const { solvePoW } = require('./lib/pow-solver');

const TOKEN_TRADER_DIR = path.join(os.homedir(), '.token-trader');
const NONCE_PATH = path.join(TOKEN_TRADER_DIR, 'pow-nonces.jsonl');
const BATCH_PATH = path.join(TOKEN_TRADER_DIR, 'pending-batch.jsonl');
const SYNC_STATE_PATH = path.join(TOKEN_TRADER_DIR, 'last-sync.json');
const AUTH_PATH = path.join(TOKEN_TRADER_DIR, 'auth.json');
const BACKEND_URL = process.env.TOKEN_TRADER_BACKEND_URL || 'https://token-trader-api.fly.dev';

const BATCH_SIZE_TRIGGER = 10;
const SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

// Read hook data from stdin
let hookData = {};
try {
  const input = fs.readFileSync(0, 'utf8');
  if (input.trim()) hookData = JSON.parse(input);
} catch (_) {}

const sessionId = hookData.session_id || 'unknown';

/**
 * Get the most recent PoW nonce from the nonce log.
 */
function getLatestNonce() {
  try {
    if (!fs.existsSync(NONCE_PATH)) return null;
    const lines = fs.readFileSync(NONCE_PATH, 'utf-8').trim().split('\n').filter(Boolean);
    if (lines.length === 0) return null;
    return JSON.parse(lines[lines.length - 1]);
  } catch (_) {
    return null;
  }
}

/**
 * Read the auth token and public key from auth.json.
 */
function getAuth() {
  try {
    if (!fs.existsSync(AUTH_PATH)) return null;
    const auth = JSON.parse(fs.readFileSync(AUTH_PATH, 'utf-8'));
    if (!auth.access_token || !auth.public_key) return null;
    return auth;
  } catch (_) {
    return null;
  }
}

/**
 * Check whether enough time has passed to trigger a time-based sync.
 */
function shouldSyncByTime() {
  try {
    if (!fs.existsSync(SYNC_STATE_PATH)) return true;
    const state = JSON.parse(fs.readFileSync(SYNC_STATE_PATH, 'utf-8'));
    return Date.now() - (state.last_sync_at || 0) >= SYNC_INTERVAL_MS;
  } catch (_) {
    return true;
  }
}

/**
 * Persist the timestamp of the last successful sync.
 */
function recordSync() {
  try {
    fs.writeFileSync(SYNC_STATE_PATH, JSON.stringify({ last_sync_at: Date.now() }));
  } catch (_) {}
}

/**
 * Build a signed impression from the latest nonce and append it to the pending batch.
 */
function createImpression() {
  const nonce = getLatestNonce();
  if (!nonce) return; // No nonce available (backend was unreachable during ad fetch)

  // Solve PoW (~100-500ms)
  const powSolution = solvePoW(nonce.pow_nonce);

  const timestamp = new Date().toISOString();
  const payload = `${nonce.ad_id}|${sessionId}|${timestamp}|${nonce.pow_nonce}`;
  const signature = signPayload(payload);

  const impression = {
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
  };

  fs.mkdirSync(TOKEN_TRADER_DIR, { recursive: true });
  fs.appendFileSync(BATCH_PATH, JSON.stringify(impression) + '\n');
}

/**
 * POST the pending batch to the backend. Clears local state on success.
 */
async function syncBatch() {
  const auth = getAuth();
  if (!auth) return; // Not authenticated yet

  if (!fs.existsSync(BATCH_PATH)) return;

  const lines = fs.readFileSync(BATCH_PATH, 'utf-8').trim().split('\n').filter(Boolean);
  if (lines.length === 0) return;

  const batch = lines.map((line) => JSON.parse(line));

  try {
    const response = await fetch(`${BACKEND_URL}/api/v1/impressions/batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${auth.access_token}`,
        'X-Device-Key': auth.public_key,
      },
      body: JSON.stringify({ batch }),
      signal: AbortSignal.timeout(10000),
    });

    if (response.ok) {
      // Clear pending state after successful sync
      fs.writeFileSync(BATCH_PATH, '');
      fs.writeFileSync(NONCE_PATH, '');
      recordSync();
    }
  } catch (_) {
    // Backend unreachable — keep batch for next sync attempt
  }
}

(async () => {
  createImpression();

  // Read current pending count to decide if we should sync
  const pendingLines = fs.existsSync(BATCH_PATH)
    ? fs.readFileSync(BATCH_PATH, 'utf-8').trim().split('\n').filter(Boolean)
    : [];

  if (pendingLines.length >= BATCH_SIZE_TRIGGER || shouldSyncByTime()) {
    await syncBatch();
  }

  process.exit(0);
})().catch(() => {
  process.exit(0);
});
