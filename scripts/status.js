#!/usr/bin/env node
/**
 * Thin wrapper — Phase 7 moved status to `token-trader status`.
 * Kept for compatibility with existing docs and habits.
 */
require('../src/commands/status').run().catch((err) => {
  console.error(`token-trader: ${err.message || err}`);
  process.exit(1);
});
