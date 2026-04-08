/**
 * token-trader login
 *
 * GitHub device flow → store JWT → generate Ed25519 keypair → register device.
 * All in one shot. Auto-opens the verification URL in the default browser.
 */
const { spawn } = require('child_process');
const { request } = require('../lib/backend');
const auth = require('../lib/auth');
const log = require('../lib/log');
const {
  getOrCreateKeypair,
  getPublicKeyBase64,
} = require('../../scripts/lib/device-key');
const { getOrCreateFingerprint } = require('../../scripts/lib/device-fingerprint');

function openBrowser(url) {
  const cmd =
    process.platform === 'darwin' ? 'open' :
    process.platform === 'win32' ? 'start' :
    'xdg-open';
  try {
    spawn(cmd, [url], { detached: true, stdio: 'ignore' }).unref();
  } catch (_) {
    // Fall back to printing only.
  }
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function run() {
  if (auth.read()) {
    console.log('Already signed in. Run `token-trader logout` first to switch accounts.');
    return;
  }

  // Prepare device identity up front so we can register immediately on auth.
  getOrCreateKeypair();
  const fingerprint = getOrCreateFingerprint();
  const publicKey = getPublicKeyBase64();

  console.log('TokenTrader — sign in with GitHub\n');

  const start = await request('POST', '/api/v1/auth/device/start', {});
  if (start.status !== 200) {
    console.error('Failed to start device flow:', start.body);
    process.exit(1);
  }

  const { poll_token, user_code, verification_uri, interval, expires_in } = start.body;
  let pollMs = (interval || 5) * 1000;

  console.log(`  Visit:       ${verification_uri}`);
  console.log(`  Enter code:  ${user_code}\n`);
  openBrowser(verification_uri);
  console.log(`(Code expires in ~${Math.round((expires_in || 900) / 60)} minutes. Waiting…)\n`);

  const deadline = Date.now() + (expires_in || 900) * 1000;
  let tokenData = null;
  while (Date.now() < deadline) {
    await sleep(pollMs);
    const poll = await request('POST', '/api/v1/auth/device/poll', { poll_token });
    if (poll.status === 200 && poll.body.status === 'complete') {
      tokenData = poll.body;
      break;
    }
    if (poll.body.status === 'pending') continue;
    if (poll.body.status === 'slow_down') {
      pollMs = (poll.body.interval || pollMs / 1000 + 5) * 1000;
      continue;
    }
    if (poll.body.status === 'denied') {
      console.error('Authorization denied. Aborting.');
      process.exit(1);
    }
    if (poll.body.status === 'expired' || poll.status === 404) {
      console.error('Device code expired. Run `token-trader login` again.');
      process.exit(1);
    }
    // Anything else (5xx, unexpected shape) — bail out loudly instead of looping forever.
    if (poll.status >= 400) {
      console.error(`\nBackend error during poll: ${poll.status} ${poll.body?.error || JSON.stringify(poll.body)}`);
      console.error('Check `fly logs` and re-run `token-trader login`.');
      process.exit(1);
    }
  }
  if (!tokenData) {
    console.error('Timed out waiting for authorization.');
    process.exit(1);
  }

  console.log(`Authorized as @${tokenData.user.github_username}.`);
  if (!tokenData.user.github_verified) {
    console.log(
      '  (account does not meet the 6-month age requirement — you can still see ads,\n' +
      '   but earnings are paused until your account ages in)'
    );
  }
  console.log('Registering device…');

  const reg = await request(
    'POST',
    '/api/v1/auth/device/register',
    { public_key: publicKey, fingerprint },
    { authData: { access_token: tokenData.access_token, public_key: publicKey } }
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

  auth.write({
    access_token: tokenData.access_token,
    expires_at: tokenData.expires_at,
    user: tokenData.user,
    device_id: reg.body.device_id,
    public_key: publicKey,
  });

  log.info(`login ok user=${tokenData.user.github_username} device=${reg.body.device_id}`);
  console.log(`\nDevice registered (${reg.body.active_device_count}/3 active).`);
  console.log('You are all set. Run `token-trader status` to see your balance.');
}

module.exports = { run };
