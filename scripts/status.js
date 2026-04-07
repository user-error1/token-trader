#!/usr/bin/env node
/**
 * TokenTrader — status.js
 *
 * Prints the user's current credit ledger as a simple progress bar.
 * Reads auth from ~/.token-trader/auth.json and calls GET /api/v1/ledger.
 *
 * Run with:  node ~/repos/token-trader/scripts/status.js
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const BACKEND_URL = process.env.TOKEN_TRADER_BACKEND_URL || 'https://token-trader-api.fly.dev';
const AUTH_PATH = path.join(os.homedir(), '.token-trader', 'auth.json');

const BAR_WIDTH = 40;
const MONTHLY_GOAL = 20.0;

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

function renderBar(fraction) {
  const filled = Math.max(0, Math.min(BAR_WIDTH, Math.round(fraction * BAR_WIDTH)));
  return '[' + '#'.repeat(filled) + '-'.repeat(BAR_WIDTH - filled) + ']';
}

function formatMonth(monthStr) {
  // "2026-04-01" → "April 2026"
  try {
    const [y, m] = monthStr.split('-');
    const names = ['January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'];
    return `${names[parseInt(m, 10) - 1]} ${y}`;
  } catch (_) {
    return monthStr;
  }
}

(async () => {
  const auth = getAuth();
  if (!auth) {
    console.error('Not authenticated. Run: node scripts/auth.js');
    process.exit(1);
  }

  let res;
  try {
    res = await fetch(`${BACKEND_URL}/api/v1/ledger`, {
      headers: {
        Authorization: `Bearer ${auth.access_token}`,
        'X-Device-Key': auth.public_key,
      },
      signal: AbortSignal.timeout(10000),
    });
  } catch (err) {
    console.error(`Backend unreachable: ${err.message}`);
    process.exit(2);
  }

  if (!res.ok) {
    const text = await res.text();
    console.error(`Error ${res.status}: ${text}`);
    process.exit(3);
  }

  const data = await res.json();
  const earned = parseFloat(data.earned_amount);
  const fraction = Math.min(1, earned / MONTHLY_GOAL);
  const pct = (fraction * 100).toFixed(1);

  console.log('');
  console.log(`TokenTrader — ${formatMonth(data.month)}`);
  console.log('');
  console.log(`  Earned this month:  $${earned.toFixed(2)} / $${MONTHLY_GOAL.toFixed(2)}`);
  console.log(`  ${renderBar(fraction)}  ${pct}%`);
  console.log('');
  console.log(`  Impressions today:      ${data.today_impressions} / 200`);
  console.log(`  Impressions this month: ${data.total_impressions}`);
  console.log('');

  if (data.gift_card_issued && data.gift_card_code) {
    console.log(`  *** Gift card issued! ***`);
    console.log(`  Code: ${data.gift_card_code}`);
    console.log(`  Redeem at: https://claude.ai/redeem`);
  } else if (data.monthly_cap_reached) {
    console.log(`  You've earned a $${MONTHLY_GOAL.toFixed(2)} gift card!`);
    console.log(`  It will be issued shortly. Impressions continue to be recorded;`);
    console.log(`  earnings resume next month.`);
  } else if (data.estimated_days_remaining != null) {
    console.log(`  At your current pace, gift card in ~${data.estimated_days_remaining} days.`);
  } else {
    console.log(`  Gift card unlocks at $${MONTHLY_GOAL.toFixed(2)}.`);
  }
  console.log('');
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
