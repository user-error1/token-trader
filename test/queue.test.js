/**
 * Queue lib unit tests. Run with `node test/queue.test.js`.
 *
 * Uses a temp-dir overlay so it doesn't touch the user's real
 * ~/.token-trader/pending-batch.jsonl.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

// Override HOME_DIR before requiring queue — forces paths to a tmpdir.
const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'tt-queue-test-'));
process.env.HOME = tmpHome;
const realHome = os.homedir;
os.homedir = () => tmpHome;

// Stub config with a tiny hard cap so we can test eviction fast.
const configPath = require.resolve('../src/lib/config');
require.cache[configPath] = {
  id: configPath,
  filename: configPath,
  loaded: true,
  exports: {
    BACKEND_URL: 'http://localhost:3000',
    PLUGIN_VERSION: '0.0.0-test',
    AD_FETCH_TIMEOUT_MS: 500,
    QUEUE_HARD_CAP: 5,
    SYNC_PERIODIC_MS: 60_000,
    SYNC_QUEUE_TRIGGER: 50,
    SYNC_BACKOFF_MS: [1, 1, 1],
    LOG_ROTATE_DAYS: 7,
    LOG_MAX_BYTES: 1_000_000,
  },
};

const queue = require('../src/lib/queue');

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) {
    pass++;
    console.log(`  ok    ${msg}`);
  } else {
    fail++;
    console.log(`  FAIL  ${msg}`);
  }
}

function eq(a, b, msg) {
  assert(a === b, `${msg} (got ${a}, expected ${b})`);
}

// ---------- tests ----------

console.log('queue lib tests');
console.log('');

// 1. empty start
queue.clear();
eq(queue.size(), 0, 'empty queue has size 0');
assert(queue.peek(10).length === 0, 'peek on empty returns []');

// 2. enqueue + size
queue.enqueue({ ad_id: 'a1', ts: 1 });
queue.enqueue({ ad_id: 'a2', ts: 2 });
queue.enqueue({ ad_id: 'a3', ts: 3 });
eq(queue.size(), 3, 'size after 3 enqueues');

// 3. peek preserves order
const peeked = queue.peek(2);
eq(peeked.length, 2, 'peek(2) returns 2');
eq(peeked[0].ad_id, 'a1', 'peek first is a1');
eq(peeked[1].ad_id, 'a2', 'peek second is a2');
eq(queue.size(), 3, 'peek does not remove');

// 4. ackHead(2) removes first two
queue.ackHead(2);
eq(queue.size(), 1, 'size after ackHead(2)');
const after = queue.readAll();
eq(after[0].ad_id, 'a3', 'remaining entry is a3');

// 5. ackHead beyond size
queue.ackHead(100);
eq(queue.size(), 0, 'ackHead > size drains the queue');

// 6. hard cap FIFO eviction (cap=5 per stubbed config)
queue.clear();
for (let i = 0; i < 8; i++) queue.enqueue({ ad_id: `x${i}` });
eq(queue.size(), 5, 'queue size after 8 enqueues with cap=5');
const remaining = queue.readAll();
eq(remaining[0].ad_id, 'x3', 'oldest 3 evicted (newest survive)');
eq(remaining[4].ad_id, 'x7', 'newest is at tail');

// 7. clear
queue.clear();
eq(queue.size(), 0, 'clear resets queue');

// 8. appendOnly survives rewrites: enqueue after eviction still works
queue.enqueue({ ad_id: 'after-clear' });
eq(queue.size(), 1, 'enqueue works after clear');

console.log('');
console.log(`${pass} passed, ${fail} failed`);
os.homedir = realHome;
try { fs.rmSync(tmpHome, { recursive: true, force: true }); } catch (_) {}
process.exit(fail > 0 ? 1 : 0);
