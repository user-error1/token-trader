#!/usr/bin/env node
/**
 * TokenTrader — show-ad.js
 *
 * Stop hook. Logs an impression for the currently displayed ad.
 * Visual display is handled by the statusLine feature (statusline-ad.js).
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const ADS_PATH = path.join(__dirname, 'ads.json');
const LOG_DIR = path.join(os.homedir(), '.token-trader');
const LOG_PATH = path.join(LOG_DIR, 'impressions.jsonl');

// Read hook data from stdin
let hookData = {};
try {
  const input = fs.readFileSync(0, 'utf8');
  if (input.trim()) hookData = JSON.parse(input);
} catch (_) {}

const sessionId = hookData.session_id || null;

// Load ads
let ads;
try {
  ads = JSON.parse(fs.readFileSync(ADS_PATH, 'utf8'));
} catch (_) {
  process.exit(0);
}
if (!ads.length) process.exit(0);

const ad = ads[Math.floor(Math.random() * ads.length)];

// Log impression
try {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  fs.appendFileSync(LOG_PATH, JSON.stringify({
    timestamp: new Date().toISOString(),
    session_id: sessionId,
    ad_id: ad.id,
    advertiser: ad.advertiser
  }) + '\n');
} catch (_) {}

process.exit(0);
