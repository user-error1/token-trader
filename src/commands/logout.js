/**
 * token-trader logout
 *
 * Delete auth.json and device.key. The fingerprint stays — it's machine
 * identity, not account identity, so a future login from this machine
 * re-uses it (and re-registers the same device row).
 *
 * Also removes the statusLine entry from ~/.claude/settings.json so ads
 * stop appearing.
 */
const fs = require('fs');
const path = require('path');
const auth = require('../lib/auth');
const { DEVICE_KEY_PATH } = require('../lib/paths');

function removeStatusLine() {
  const settingsPath = path.join(
    process.env.HOME || process.env.USERPROFILE,
    '.claude',
    'settings.json'
  );
  try {
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    if (settings.statusLine && settings.statusLine.command &&
        settings.statusLine.command.includes('statusline-ad.js')) {
      delete settings.statusLine;
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
      return true;
    }
  } catch (_) {}
  return false;
}

function run() {
  const had = !!auth.read();
  auth.clear();
  try { fs.unlinkSync(DEVICE_KEY_PATH); } catch (_) {}
  const removedStatusLine = removeStatusLine();
  if (had) {
    console.log('Signed out. Local auth and device key deleted.');
    if (removedStatusLine) console.log('Status line removed — ads will stop on next Claude Code session.');
  } else {
    console.log('No active session. (Nothing to do.)');
  }
}

module.exports = { run };
