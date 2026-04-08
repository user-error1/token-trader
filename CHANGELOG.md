# Changelog

## v1.0.0 — 2026-04-08

First release where the backend is a required dependency. Earlier versions
ran purely locally and didn't sync credit.

### New

- **`token-trader` CLI** with subcommands: `login`, `logout`, `status`,
  `devices`, `sync`, `doctor`, `help`. Install via `npm link` in the repo
  root.
- **GitHub Device Flow login** (`token-trader login`) — auto-opens the
  verification URL in the default browser, handles the full poll → auth →
  device registration round-trip in one command.
- **Device management** (`token-trader devices`) — list active devices,
  revoke with `--revoke <fingerprint-prefix>`. Revoking the current device
  also wipes the local `device.key` so the next run re-registers cleanly.
- **Impression queue** persisted to `~/.token-trader/pending-batch.jsonl`
  with FIFO eviction at 10,000 entries. Never loses credit to short
  outages; evicts oldest-first only on catastrophic queue growth.
- **Sync engine with backoff schedule**: 30s → 5min → 30min forever on
  failure. `token-trader sync` bypasses the gate for manual flushes. The
  Stop-hook tick respects it.
- **`token-trader doctor`** — health check across auth, device key, queue,
  fallback inventory, debug log, backend reachability, and live auth
  validation. Reports exit code 0/1/2 on pass/fail/warn.
- **JWT refresh** — the plugin silently refreshes expiring JWTs on any 401
  via `POST /auth/refresh`. No re-auth prompts during normal use.
- **Plugin version gate** — backend returns 426 Upgrade Required when
  `X-Plugin-Version` is below `MIN_PLUGIN_VERSION`. Keeps old plugins from
  silently breaking new API contracts.
- **Debug log** at `~/.token-trader/debug.log` with age + size rotation
  (7 days / 1 MB). `doctor` surfaces recent errors.

### Changed

- `statusline-ad.js` ad fetch timeout reduced from 3000ms → **500ms** so
  the hot path never stalls when the backend is slow.
- Ad fetch now sends `X-Plugin-Version` header.
- First backend failure per Claude Code session logs a one-shot notice to
  `debug.log` (keyed on parent PID).
- `scripts/auth.js` and `scripts/status.js` are now thin wrappers around
  the new `src/commands/*` dispatchers so old muscle memory still works.

### Upgrade notes

If you have a pre-v1.0.0 install:

```bash
cd ~/repos/token-trader
git pull
npm link                     # puts `token-trader` on your PATH
token-trader login           # re-auth against the backend
token-trader doctor          # verify everything
```

Your existing `~/.token-trader/pending-batch.jsonl` carries over. If it
contains old entries without signatures (pre-Phase 3), run
`rm ~/.token-trader/pending-batch.jsonl` before syncing.
