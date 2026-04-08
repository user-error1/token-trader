#!/usr/bin/env node
/**
 * Thin wrapper — Phase 7 moved login to `token-trader login`.
 * Kept for compatibility with existing docs and habits.
 */
require('../src/commands/login').run().catch((err) => {
  console.error(`token-trader: ${err.message || err}`);
  process.exit(1);
});
