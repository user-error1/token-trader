#!/usr/bin/env node
/**
 * TokenTrader — generate-key.js
 *
 * Standalone install-time script. Creates the device keypair and
 * fingerprint on first run, prints them, and exits. Idempotent — running
 * again just confirms the existing values.
 */

const { getOrCreateKeypair, getPublicKeyBase64, KEY_PATH } = require('./device-key');
const { getOrCreateFingerprint, FINGERPRINT_PATH } = require('./device-fingerprint');

getOrCreateKeypair();
const fingerprint = getOrCreateFingerprint();

console.log(`Public key:  ${getPublicKeyBase64()}`);
console.log(`Key file:    ${KEY_PATH}`);
console.log(`Fingerprint: ${fingerprint.slice(0, 16)}…`);
console.log(`FP file:     ${FINGERPRINT_PATH}`);
