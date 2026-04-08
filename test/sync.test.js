/**
 * Sync backoff state machine unit tests. Run with `node test/sync.test.js`.
 *
 * Uses a tmpdir overlay + stubs the config and backend modules so nothing
 * touches the user's real state or network.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

// Overlay HOME.
const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'tt-sync-test-'));
process.env.HOME = tmpHome;
os.homedir = () => tmpHome;

// Stub config with tight backoff so the test runs fast.
const configPath = require.resolve('../src/lib/config');
require.cache[configPath] = {
  id: configPath,
  filename: configPath,
  loaded: true,
  exports: {
    BACKEND_URL: 'http://stub',
    PLUGIN_VERSION: '0.0.0-test',
    AD_FETCH_TIMEOUT_MS: 500,
    QUEUE_HARD_CAP: 100,
    SYNC_PERIODIC_MS: 1000,
    SYNC_QUEUE_TRIGGER: 50,
    SYNC_BACKOFF_MS: [100, 200, 400],
    LOG_ROTATE_DAYS: 7,
    LOG_MAX_BYTES: 1_000_000,
  },
};

// Stub the backend module so drainQueue's request() is deterministic.
const backendPath = require.resolve('../src/lib/backend');
let nextResponses = []; // queue of { status, body } or Error instances
require.cache[backendPath] = {
  id: backendPath,
  filename: backendPath,
  loaded: true,
  exports: {
    async request() {
      const r = nextResponses.shift();
      if (r instanceof Error) throw r;
      if (!r) return { status: 200, body: { accepted: [], rejections: [] } };
      return r;
    },
    buildHeaders: () => ({}),
    DEFAULT_TIMEOUT_MS: 1000,
  },
};

const queue = require('../src/lib/queue');
const sync = require('../src/lib/sync');

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; console.log(`  ok    ${msg}`); }
  else      { fail++; console.log(`  FAIL  ${msg}`); }
}
function eq(a, b, msg) { assert(a === b, `${msg} (got ${JSON.stringify(a)}, expected ${JSON.stringify(b)})`); }

async function main() {
  console.log('sync backoff tests\n');

  const authData = { access_token: 'x', public_key: 'y' };

  // 1. empty queue → status 'empty'
  queue.clear();
  let res = await sync.drainQueue({ authData, trigger: 'manual' });
  eq(res.status, 'empty', 'empty queue returns status=empty');

  // 2. happy path drain: 3 items, one batch → success, state resets failure_count
  queue.clear();
  for (let i = 0; i < 3; i++) queue.enqueue({ ad_id: `a${i}` });
  nextResponses = [{ status: 200, body: { accepted: [], rejections: [] } }];
  res = await sync.drainQueue({ authData, trigger: 'manual' });
  eq(res.status, 'ok', 'successful drain returns status=ok');
  eq(res.sent, 3, 'sent=3');
  eq(queue.size(), 0, 'queue drained');
  eq(sync.readState().failure_count, 0, 'failure_count reset on success');

  // 3. network error → failure_count=1, next_retry_at set
  queue.clear();
  queue.enqueue({ ad_id: 'a' });
  nextResponses = [new Error('ECONNREFUSED')];
  res = await sync.drainQueue({ authData, trigger: 'periodic' });
  eq(res.status, 'error', 'network error returns status=error');
  eq(queue.size(), 1, 'queue intact after failure');
  let state = sync.readState();
  eq(state.failure_count, 1, 'failure_count=1');
  assert(state.next_retry_at > Date.now(), 'next_retry_at is in the future');
  assert(state.next_retry_at - Date.now() <= 150, 'next_retry within 1st backoff window (100ms, ~150ms tolerance)');

  // 4. backoff gate: non-manual trigger returns 'backoff' while we're locked out
  res = await sync.drainQueue({ authData, trigger: 'periodic' });
  eq(res.status, 'backoff', 'periodic trigger respects backoff');
  eq(queue.size(), 1, 'queue still intact during backoff');

  // 5. manual trigger bypasses backoff
  nextResponses = [new Error('still down')];
  res = await sync.drainQueue({ authData, trigger: 'manual' });
  eq(res.status, 'error', 'manual retry during backoff attempts the call');
  eq(sync.readState().failure_count, 2, 'failure_count incremented to 2');

  // 6. backoff grows: 3rd failure → index clamps to last (400ms)
  // Wait past current window to be allowed in as periodic
  await new Promise((r) => setTimeout(r, 250));
  nextResponses = [new Error('x')];
  res = await sync.drainQueue({ authData, trigger: 'manual' });
  eq(sync.readState().failure_count, 3, 'failure_count=3');
  const delta = sync.readState().next_retry_at - Date.now();
  assert(delta > 300 && delta <= 450, `3rd failure backoff ~400ms (got ${delta}ms)`);

  // 7. 5xx response from backend treated as failure
  queue.clear();
  queue.enqueue({ ad_id: 'b' });
  nextResponses = [{ status: 500, body: { error: 'boom' } }];
  // Reset state so we aren't blocked
  fs.writeFileSync(
    path.join(tmpHome, '.token-trader', 'last-sync.json'),
    JSON.stringify({ last_success_at: 0, last_attempt_at: 0, failure_count: 0, next_retry_at: 0 })
  );
  res = await sync.drainQueue({ authData, trigger: 'manual' });
  eq(res.status, 'error', '5xx treated as error');
  eq(queue.size(), 1, 'queue intact after 5xx');

  // 8. success after failures resets everything
  nextResponses = [{ status: 200, body: {} }];
  res = await sync.drainQueue({ authData, trigger: 'manual' });
  eq(res.status, 'ok', 'recovery drain ok');
  state = sync.readState();
  eq(state.failure_count, 0, 'failure_count resets on recovery');
  eq(state.next_retry_at, 0, 'next_retry_at cleared on recovery');

  console.log('');
  console.log(`${pass} passed, ${fail} failed`);
  try { fs.rmSync(tmpHome, { recursive: true, force: true }); } catch (_) {}
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
