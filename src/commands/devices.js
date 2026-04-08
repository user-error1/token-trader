/**
 * token-trader devices  [--revoke <fingerprint-prefix>]
 *
 * Lists registered devices; --revoke marks one as revoked. Revoking the
 * current device also deletes the local device.key + auth.json so the next
 * run re-prompts for login.
 */
const fs = require('fs');
const { request } = require('../lib/backend');
const auth = require('../lib/auth');
const { DEVICE_KEY_PATH } = require('../lib/paths');

function shortFp(fp) { return fp ? fp.slice(0, 8) + '...' + fp.slice(-4) : '?'; }

async function run(args) {
  const authData = auth.require();
  const revokeIdx = args.indexOf('--revoke');
  const revokePrefix = revokeIdx >= 0 ? args[revokeIdx + 1] : null;

  const me = await request('GET', '/api/v1/auth/me', null, { auth: true });
  if (me.status !== 200) {
    console.error(`Error ${me.status}: ${me.body?.error || 'failed to load devices'}`);
    process.exit(1);
  }
  const devices = me.body.devices || [];

  if (revokePrefix) {
    const matches = devices.filter((d) => d.fingerprint?.startsWith(revokePrefix));
    if (matches.length === 0) {
      console.error(`No device matches fingerprint prefix '${revokePrefix}'.`);
      process.exit(1);
    }
    if (matches.length > 1) {
      console.error(`Ambiguous prefix — ${matches.length} devices match. Use a longer prefix.`);
      process.exit(1);
    }
    const target = matches[0];
    const res = await request('POST', `/api/v1/auth/devices/${target.id}/revoke`, {}, { auth: true });
    if (res.status !== 200) {
      console.error(`Revoke failed: ${res.body?.error || res.status}`);
      process.exit(1);
    }
    console.log(`Revoked device ${shortFp(target.fingerprint)}.`);
    // If we revoked the current device, wipe local state too.
    if (target.id === authData.device_id) {
      try { fs.unlinkSync(DEVICE_KEY_PATH); } catch (_) {}
      auth.clear();
      console.log('(This was the current device — local auth and key deleted. Run `token-trader login` to re-register.)');
    }
    return;
  }

  console.log('');
  if (devices.length === 0) {
    console.log('  No active devices.');
    console.log('');
    return;
  }
  for (const d of devices) {
    const isCurrent = d.id === authData.device_id;
    const marker = isCurrent ? '*' : ' ';
    const registered = d.registered_at ? d.registered_at.slice(0, 10) : '?';
    const lastSeen = d.last_seen_at ? d.last_seen_at.slice(0, 10) : '?';
    const tag = isCurrent ? '(this device)' : '';
    console.log(`  ${marker} ${shortFp(d.fingerprint)}  ${tag.padEnd(15)}  registered ${registered}   last seen ${lastSeen}`);
  }
  console.log(`\nUp to 3 active devices per account.`);
  console.log(`Use 'token-trader devices --revoke <prefix>' to revoke one.\n`);
}

module.exports = { run };
