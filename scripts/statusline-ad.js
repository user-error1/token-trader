#!/usr/bin/env node
/**
 * TokenTrader — statusline-ad.js
 *
 * Called by Claude Code's statusLine feature. Fetches a random ad from the
 * TokenTrader backend API, with fallback to local ads.json if unreachable.
 * Claude Code renders this persistently in the status bar at the bottom of
 * the UI — it won't be overwritten by TUI redraws.
 *
 * Phase 1: Fetches ads from backend, caches locally, falls back to ads.json
 * Phase 2: Will include device key signature
 * Phase 3: Will submit impression data with PoW solution
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const BACKEND_URL = process.env.TOKEN_TRADER_BACKEND_URL || 'https://token-trader-api.fly.dev';
const LOCAL_ADS_PATH = path.join(__dirname, 'ads.json');
const CACHE_PATH = path.join(os.homedir(), '.token-trader', 'cached-ad.json');
const NONCE_PATH = path.join(os.homedir(), '.token-trader', 'pow-nonces.jsonl');
const AUTH_PATH = path.join(os.homedir(), '.token-trader', 'auth.json');

/**
 * Read the device's public key from the saved auth file, if present.
 * Falls back to 'placeholder' for unauthenticated installs.
 */
function getDeviceKeyHeader() {
  try {
    const auth = JSON.parse(fs.readFileSync(AUTH_PATH, 'utf-8'));
    if (auth && auth.public_key) return auth.public_key;
  } catch (_) {
    // Not authenticated yet — fine, /ads/next is unauthenticated.
  }
  return 'placeholder';
}

/**
 * Fetch ad from backend API with timeout.
 */
async function fetchAdFromBackend() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 second timeout

    const response = await fetch(`${BACKEND_URL}/api/v1/ads/next`, {
      headers: {
        'X-Device-Key': getDeviceKeyHeader(),
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const ad = await response.json();

    // Cache the response locally for fallback
    try {
      const cacheDir = path.dirname(CACHE_PATH);
      if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir, { recursive: true });
      }
      fs.writeFileSync(CACHE_PATH, JSON.stringify(ad));
    } catch (_) {
      // Silently ignore cache write failures
    }

    // Store the PoW nonce for impression submission later (Phase 3)
    if (ad.pow_nonce) {
      try {
        const nonceDir = path.dirname(NONCE_PATH);
        if (!fs.existsSync(nonceDir)) {
          fs.mkdirSync(nonceDir, { recursive: true });
        }
        // Append to nonce log for later batching
        const entry = JSON.stringify({
          pow_nonce: ad.pow_nonce,
          ad_id: ad.id,
          timestamp: new Date().toISOString(),
        });
        fs.appendFileSync(NONCE_PATH, entry + '\n');
      } catch (_) {
        // Silently ignore nonce storage failures
      }
    }

    return ad;
  } catch (err) {
    // Fall through to cached/local fallback
    return null;
  }
}

/**
 * Get fallback ad from cache or local ads.json.
 */
function getFallbackAd() {
  // Try cached ad from last successful backend fetch
  try {
    if (fs.existsSync(CACHE_PATH)) {
      return JSON.parse(fs.readFileSync(CACHE_PATH, 'utf-8'));
    }
  } catch (_) {
    // Silently ignore cache read failures
  }

  // Final fallback: local ads.json
  try {
    const ads = JSON.parse(fs.readFileSync(LOCAL_ADS_PATH, 'utf-8'));
    if (ads.length > 0) {
      return ads[Math.floor(Math.random() * ads.length)];
    }
  } catch (_) {
    // Silently ignore local ads read failures
  }

  return null;
}

/**
 * Main: fetch ad and print to stdout.
 */
(async () => {
  let ad = await fetchAdFromBackend();

  if (!ad) {
    ad = getFallbackAd();
  }

  if (!ad || !ad.text) {
    // No ad available — exit silently
    process.exit(0);
  }

  // Print to stdout — Claude Code displays this in the status line
  process.stdout.write(`[ad] ${ad.text}`);
  process.exit(0);
})().catch(() => {
  process.exit(0);
});
