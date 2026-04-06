/**
 * TokenTrader — device-fingerprint.js
 *
 * Deterministic per-machine fingerprint, used by the backend to enforce
 * "one user per physical machine". Generated ONCE at install time and
 * cached at ~/.token-trader/fingerprint so subsequent plugin runs do not
 * re-shell out.
 */

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

const FINGERPRINT_PATH = path.join(os.homedir(), '.token-trader', 'fingerprint');

/**
 * Return the cached fingerprint if it exists, otherwise generate + cache one.
 */
function getOrCreateFingerprint() {
  if (fs.existsSync(FINGERPRINT_PATH)) {
    const cached = fs.readFileSync(FINGERPRINT_PATH, 'utf-8').trim();
    if (cached) return cached;
  }

  const signals = [];

  // CPU model + core count (cross-platform via Node).
  const cpus = os.cpus();
  signals.push(cpus[0]?.model || 'unknown-cpu');
  signals.push(String(cpus.length));

  // Hostname adds entropy and is user-assigned.
  signals.push(os.hostname());

  // Disk volume UUID — one platform-specific call, not five.
  if (process.platform === 'darwin') {
    signals.push(execCommand("diskutil info / | awk '/Volume UUID/ {print $NF}'"));
  } else if (process.platform === 'linux') {
    signals.push(
      execCommand('blkid -s UUID -o value $(findmnt -n -o SOURCE /) 2>/dev/null || echo unknown')
    );
  } else {
    signals.push('unknown-disk');
  }

  const raw = signals.join('|');
  const hash = crypto.createHash('sha256').update(raw).digest('hex');

  fs.mkdirSync(path.dirname(FINGERPRINT_PATH), { recursive: true });
  fs.writeFileSync(FINGERPRINT_PATH, hash, { mode: 0o644 });
  return hash;
}

function execCommand(cmd) {
  try {
    return execSync(cmd, { timeout: 5000, stdio: ['pipe', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch (_) {
    return 'unknown';
  }
}

module.exports = { getOrCreateFingerprint, FINGERPRINT_PATH };
