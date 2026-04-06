/**
 * TokenTrader — device-key.js
 *
 * Ed25519 keypair management for impression signing.
 *
 * The private key is stored at ~/.token-trader/device.key with 0600
 * permissions. It NEVER leaves the device. Only the public key is
 * registered with the backend.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');

const KEY_DIR = path.join(os.homedir(), '.token-trader');
const KEY_PATH = path.join(KEY_DIR, 'device.key');

/**
 * Return the existing keypair, or generate a new one if none exists.
 *
 * File format (JSON):
 *   { publicKey: "<base64>", privateKey: "<base64>", createdAt: "<ISO>" }
 */
function getOrCreateKeypair() {
  if (fs.existsSync(KEY_PATH)) {
    try {
      const stored = JSON.parse(fs.readFileSync(KEY_PATH, 'utf-8'));
      if (stored.publicKey && stored.privateKey) {
        ensure600(KEY_PATH);
        return {
          publicKey: Buffer.from(stored.publicKey, 'base64'),
          privateKey: Buffer.from(stored.privateKey, 'base64'),
        };
      }
    } catch (_) {
      // Corrupted key file — regenerate.
    }
  }

  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');

  // Extract the raw 32-byte key material. Node exports Ed25519 keys as
  // SPKI/PKCS8 DER blobs; the raw key sits at the end.
  const pubRaw = publicKey.export({ type: 'spki', format: 'der' }).slice(-32);
  const privRaw = privateKey.export({ type: 'pkcs8', format: 'der' }).slice(-32);

  fs.mkdirSync(KEY_DIR, { recursive: true });
  fs.writeFileSync(
    KEY_PATH,
    JSON.stringify({
      publicKey: pubRaw.toString('base64'),
      privateKey: privRaw.toString('base64'),
      createdAt: new Date().toISOString(),
    }),
    { mode: 0o600 }
  );
  ensure600(KEY_PATH);

  return { publicKey: pubRaw, privateKey: privRaw };
}

/**
 * Sign a payload string with the device's Ed25519 private key.
 * Returns a base64-encoded signature.
 */
function signPayload(payload) {
  const { privateKey } = getOrCreateKeypair();

  // Reconstruct a Node KeyObject from the raw 32-byte key by prepending
  // the standard Ed25519 PKCS8 DER prefix.
  const PKCS8_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');
  const keyObject = crypto.createPrivateKey({
    key: Buffer.concat([PKCS8_PREFIX, privateKey]),
    format: 'der',
    type: 'pkcs8',
  });

  return crypto.sign(null, Buffer.from(payload), keyObject).toString('base64');
}

/**
 * Get the device's public key as a base64 string (used for backend
 * registration and the X-Device-Key header).
 */
function getPublicKeyBase64() {
  return getOrCreateKeypair().publicKey.toString('base64');
}

/**
 * Defensive permission check — if the file ever ends up world-readable
 * (e.g. via a clumsy backup restore), tighten it back down.
 */
function ensure600(filePath) {
  try {
    const stats = fs.statSync(filePath);
    if ((stats.mode & 0o777) !== 0o600) {
      fs.chmodSync(filePath, 0o600);
    }
  } catch (_) {
    // Best effort.
  }
}

module.exports = { getOrCreateKeypair, signPayload, getPublicKeyBase64, KEY_PATH };
