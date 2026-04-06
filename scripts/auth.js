#!/usr/bin/env node
/**
 * TokenTrader — auth.js
 *
 * First-run authentication flow:
 *   1. POST /auth/device/start    → get user_code + verification_uri
 *   2. Print instructions; user opens URL in any browser and enters the code
 *   3. POST /auth/device/poll until status === "complete"
 *   4. Persist TT JWT to ~/.token-trader/auth.json
 *   5. POST /auth/device/register with the local public key + fingerprint
 *
 * Run with:  node ~/repos/token-trader/scripts/auth.js
 *      or:   node $CLAUDE_PLUGIN_DIR/scripts/auth.js
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const { getOrCreateKeypair, getPublicKeyBase64 } = require('./lib/device-key');
const { getOrCreateFingerprint } = require('./lib/device-fingerprint');

const BACKEND_URL = process.env.TOKEN_TRADER_BACKEND_URL || 'https://token-trader-api.fly.dev';
const AUTH_PATH = path.join(os.homedir(), '.token-trader', 'auth.json');

async function post(pathname, body) {
  const res = await fetch(`${BACKEND_URL}${pathname}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch (_) {
    json = { error: text };
  }
  return { status: res.status, body: json };
}

async function postWithAuth(pathname, body, token, deviceKey) {
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
  if (deviceKey) headers['X-Device-Key'] = deviceKey;

  const res = await fetch(`${BACKEND_URL}${pathname}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body || {}),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch (_) {
    json = { error: text };
  }
  return { status: res.status, body: json };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function saveAuth(data) {
  fs.mkdirSync(path.dirname(AUTH_PATH), { recursive: true });
  fs.writeFileSync(AUTH_PATH, JSON.stringify(data, null, 2), { mode: 0o600 });
}

async function main() {
  // Make sure the device has a keypair + fingerprint before we even talk
  // to the backend. install.sh normally handles this, but be defensive.
  getOrCreateKeypair();
  const fingerprint = getOrCreateFingerprint();
  const publicKey = getPublicKeyBase64();

  console.log('TokenTrader — sign in with GitHub\n');

  // 1. Start device flow.
  const start = await post('/api/v1/auth/device/start', {});
  if (start.status !== 200) {
    console.error('Failed to start device flow:', start.body);
    process.exit(1);
  }

  const { poll_token, user_code, verification_uri, interval, expires_in } = start.body;
  let pollInterval = (interval || 5) * 1000;

  console.log(`  1. Open: ${verification_uri}`);
  console.log(`  2. Enter code: ${user_code}`);
  console.log(`  3. Authorize TokenTrader on GitHub.\n`);
  console.log(`(Code expires in ~${Math.round((expires_in || 900) / 60)} minutes. Waiting…)\n`);

  // 2. Poll until complete.
  const deadline = Date.now() + (expires_in || 900) * 1000;
  let auth = null;

  while (Date.now() < deadline) {
    await sleep(pollInterval);
    const poll = await post('/api/v1/auth/device/poll', { poll_token });

    if (poll.status === 200 && poll.body.status === 'complete') {
      auth = poll.body;
      break;
    }
    if (poll.body.status === 'pending') continue;
    if (poll.body.status === 'slow_down') {
      pollInterval = (poll.body.interval || pollInterval / 1000 + 5) * 1000;
      continue;
    }
    if (poll.body.status === 'denied') {
      console.error('You denied the authorization. Aborting.');
      process.exit(1);
    }
    if (poll.body.status === 'expired' || poll.status === 404) {
      console.error('The device code expired. Run this command again.');
      process.exit(1);
    }
  }

  if (!auth) {
    console.error('Timed out waiting for authorization.');
    process.exit(1);
  }

  console.log(`Signed in as @${auth.user.github_username}`);
  if (!auth.user.github_verified) {
    console.log(
      '  (account does not yet meet the 6-month age requirement — you can still see ads,\n   but earnings are paused until your account ages in)'
    );
  }

  // 3. Register the device.
  const reg = await postWithAuth(
    '/api/v1/auth/device/register',
    { public_key: publicKey, fingerprint },
    auth.access_token,
    publicKey
  );

  if (reg.status === 409) {
    console.error('\nThis machine is already registered to a different TokenTrader account.');
    console.error('Each physical machine can only feed one earning account.');
    process.exit(1);
  }
  if (reg.status !== 200) {
    console.error('Device registration failed:', reg.body);
    process.exit(1);
  }

  // 4. Persist everything for future plugin runs.
  saveAuth({
    access_token: auth.access_token,
    expires_at: auth.expires_at,
    user: auth.user,
    device_id: reg.body.device_id,
    public_key: publicKey,
  });

  console.log(`\nDevice registered (${reg.body.active_device_count}/3 active).`);
  console.log(`Auth file: ${AUTH_PATH}`);
  console.log('\nYou are all set. Restart Claude Code to begin earning.');
}

main().catch((err) => {
  console.error('Unexpected error:', err.message || err);
  process.exit(1);
});
