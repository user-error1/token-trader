/**
 * token-trader login
 *
 * GitHub device flow → store JWT → generate Ed25519 keypair → register device.
 * All in one shot. Auto-opens the verification URL in the default browser.
 */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { request } = require('../lib/backend');
const auth = require('../lib/auth');
const log = require('../lib/log');
const {
  getOrCreateKeypair,
  getPublicKeyBase64,
} = require('../../scripts/lib/device-key');
const { getOrCreateFingerprint } = require('../../scripts/lib/device-fingerprint');

/**
 * Ensure the Claude Code statusLine is configured to show ads.
 * Reads ~/.claude/settings.json, adds or updates the statusLine entry.
 * Handles version upgrades by detecting stale paths.
 */
function ensureStatusLine() {
  const pluginRoot = path.resolve(__dirname, '..', '..');
  const settingsPath = path.join(
    process.env.HOME || process.env.USERPROFILE,
    '.claude',
    'settings.json'
  );

  let settings = {};
  try {
    settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  } catch (_) {
    // File missing or malformed — start fresh.
  }

  const expected = `node ${pluginRoot}/scripts/statusline-ad.js`;

  // Already correct — nothing to do.
  if (settings.statusLine && settings.statusLine.command === expected) return false;

  // Skip if user has a non-token-trader statusLine configured.
  if (settings.statusLine && settings.statusLine.command &&
      !settings.statusLine.command.includes('statusline-ad.js')) {
    return false;
  }

  settings.statusLine = { type: 'command', command: expected };

  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
  return true;
}

function isWSL() {
  if (process.platform !== 'linux') return false;
  if (process.env.WSL_DISTRO_NAME || process.env.WSL_INTEROP) return true;
  try {
    return /microsoft/i.test(fs.readFileSync('/proc/version', 'utf8'));
  } catch (_) {
    return false;
  }
}

function openBrowser(url) {
  const attempts = [];
  if (process.platform === 'darwin') {
    attempts.push(['open', [url]]);
  } else if (process.platform === 'win32') {
    attempts.push(['cmd', ['/c', 'start', '""', url]]);
  } else if (isWSL()) {
    attempts.push(['wslview', [url]]);
    attempts.push(['powershell.exe', ['-NoProfile', '-Command', `Start-Process '${url}'`]]);
    attempts.push(['cmd.exe', ['/c', 'start', '""', url]]);
  } else {
    attempts.push(['xdg-open', [url]]);
  }
  for (const [cmd, args] of attempts) {
    try {
      const child = spawn(cmd, args, { detached: true, stdio: 'ignore' });
      child.on('error', () => {});
      child.unref();
      return;
    } catch (_) {
      // Try next fallback.
    }
  }
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// Print a user-facing message to stdout and ALSO to /dev/tty when stdout
// isn't a TTY. Claude Code runs this CLI as a subprocess that captures stdout
// (and truncates it in the UI), so /dev/tty is the only channel that reliably
// reaches the user's real terminal. When the CLI is run directly from a
// terminal, stdout IS the terminal, so we skip /dev/tty to avoid double prints.
function say(msg) {
  console.log(msg);
  if (!process.stdout.isTTY) {
    try { fs.writeFileSync('/dev/tty', msg + '\n'); } catch (_) {}
  }
}
function sayErr(msg) {
  console.error(msg);
  if (!process.stderr.isTTY) {
    try { fs.writeFileSync('/dev/tty', msg + '\n'); } catch (_) {}
  }
}

async function run() {
  if (auth.read()) {
    // Already signed in — still ensure status line is configured (fixes
    // upgrades and fresh installs that skipped install.sh).
    if (ensureStatusLine()) {
      console.log('Already signed in. Status line configured — ads will appear on next Claude Code session.');
    } else {
      console.log('Already signed in. Run `/token-trader:logout` first to switch accounts.');
    }
    return;
  }

  // Prepare device identity up front so we can register immediately on auth.
  getOrCreateKeypair();
  const fingerprint = getOrCreateFingerprint();
  const publicKey = getPublicKeyBase64();

  console.log('TokenTrader — sign in with GitHub\n');

  const start = await request('POST', '/api/v1/auth/device/start', {});
  if (start.status !== 200) {
    sayErr(`Failed to start device flow: ${JSON.stringify(start.body)}`);
    process.exit(1);
  }

  const { poll_token, user_code, verification_uri, interval } = start.body;
  let pollMs = (interval || 5) * 1000;

  // Cap the poll window below the Bash tool's 10-min max so the CLI exits
  // gracefully (instead of being killed) when invoked from /token-trader:login.
  const MAX_POLL_SECONDS = 9 * 60;
  const expires_in = Math.min(start.body.expires_in || 900, MAX_POLL_SECONDS);

  openBrowser(verification_uri);
  const minutes = Math.round(expires_in / 60);
  const lines = [
    '',
    '====================================================================',
    '  ACTION REQUIRED — complete GitHub device login',
    '====================================================================',
    `  1. Open this URL:   ${verification_uri}`,
    `  2. Enter this code: ${user_code}`,
    '',
    `  (Attempted to open the browser automatically. Code expires in ~${minutes} min.)`,
    '====================================================================',
    '',
  ];
  say(lines.join('\n'));
  say('Waiting for authorization…\n');

  const deadline = Date.now() + expires_in * 1000;
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
      sayErr('Authorization denied. Aborting.');
      process.exit(1);
    }
    if (poll.body.status === 'expired' || poll.status === 404) {
      sayErr('Device code expired. Run `/token-trader:login` again.');
      process.exit(1);
    }
    // Anything else (5xx, unexpected shape) — bail out loudly instead of looping forever.
    if (poll.status >= 400) {
      sayErr(`\nBackend error during poll: ${poll.status} ${poll.body?.error || JSON.stringify(poll.body)}`);
      sayErr('Check `fly logs` and re-run `/token-trader:login`.');
      process.exit(1);
    }
  }
  if (!tokenData) {
    sayErr('Timed out waiting for authorization. Re-run `/token-trader:login`.');
    process.exit(1);
  }

  say(`Authorized as @${tokenData.user.github_username}.`);
  if (!tokenData.user.github_verified) {
    say(
      '  (account does not meet the 6-month age requirement — you can still see ads,\n' +
      '   but earnings are paused until your account ages in)'
    );
  }
  say('Registering device…');

  const reg = await request(
    'POST',
    '/api/v1/auth/device/register',
    { public_key: publicKey, fingerprint },
    { authData: { access_token: tokenData.access_token, public_key: publicKey } }
  );

  if (reg.status === 409) {
    sayErr('\nThis machine is already registered to a different TokenTrader account.');
    sayErr('Each physical machine can only feed one earning account.');
    process.exit(1);
  }
  if (reg.status !== 200) {
    sayErr(`Device registration failed: ${JSON.stringify(reg.body)}`);
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
  say(`\nDevice registered (${reg.body.active_device_count}/3 active).`);

  if (ensureStatusLine()) {
    say('Status line configured — ads and credit earning are now active.');
  }

  say('You are all set. Run `/token-trader:status` to see your balance.');
}

module.exports = { run };
