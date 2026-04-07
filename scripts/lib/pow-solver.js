const crypto = require('crypto');

const POW_DIFFICULTY = 20; // Must match server's POW_DIFFICULTY in src/lib/pow.ts

/**
 * Solve a PoW challenge by brute-forcing SHA-256 hashes.
 *
 * @param {string} nonce - The server-issued nonce (hex string)
 * @returns {string} - The solution (hex string)
 */
function solvePoW(nonce) {
  let attempt = 0;
  while (true) {
    const solution = attempt.toString(16).padStart(8, '0');
    const hash = crypto.createHash('sha256').update(nonce + solution).digest();

    if (countLeadingZeroBits(hash) >= POW_DIFFICULTY) {
      return solution;
    }
    attempt++;
  }
}

function countLeadingZeroBits(buf) {
  let bits = 0;
  for (const byte of buf) {
    if (byte === 0) {
      bits += 8;
    } else {
      bits += Math.clz32(byte) - 24;
      break;
    }
  }
  return bits;
}

module.exports = { solvePoW };
