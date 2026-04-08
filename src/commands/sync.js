/**
 * token-trader sync
 *
 * Manual flush — bypasses the backoff gate. Used when the user wants to
 * force a sync (e.g. about to shut down, debugging).
 *
 * Exit codes:
 *   0 — queue empty or drained successfully
 *   1 — auth missing
 *   2 — sync attempt failed (queue left intact)
 */
const auth = require('../lib/auth');
const queue = require('../lib/queue');
const { drainQueue } = require('../lib/sync');

async function run() {
  const authData = auth.require();
  const start = queue.size();
  if (start === 0) {
    console.log('Queue empty — nothing to sync.');
    return;
  }
  console.log(`Flushing ${start} queued impression${start === 1 ? '' : 's'}…`);
  const res = await drainQueue({ authData, trigger: 'manual' });
  if (res.status === 'error') {
    console.error(`Sync failed. ${queue.size()} impression${queue.size() === 1 ? '' : 's'} still queued.`);
    process.exit(2);
  }
  console.log(`Done. ${res.sent} submitted${res.rejected ? `, ${res.rejected} rejected by backend` : ''}.`);
}

module.exports = { run };
