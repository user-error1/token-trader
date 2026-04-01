#!/usr/bin/env node
/**
 * TokenTrader — statusline-ad.js
 *
 * Called by Claude Code's statusLine feature. Picks a random ad from ads.json
 * and prints it to stdout. Claude Code renders this persistently in the status
 * bar at the bottom of the UI — it won't be overwritten by TUI redraws.
 */

const fs = require('fs');
const path = require('path');

const ADS_PATH = path.join(__dirname, 'ads.json');

// Load ads
let ads;
try {
  ads = JSON.parse(fs.readFileSync(ADS_PATH, 'utf8'));
} catch (_) {
  process.exit(0);
}
if (!ads.length) process.exit(0);

const ad = ads[Math.floor(Math.random() * ads.length)];

// Print to stdout — Claude Code displays this in the status line
process.stdout.write(`[ad] ${ad.text}`);
process.exit(0);
