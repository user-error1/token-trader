#!/usr/bin/env node
/**
 * TokenTrader — statusline-ad.js
 *
 * Called by Claude Code's statusLine feature. Fetches a random ad from the
 * TokenTrader backend API, with fallback to local ads.json if unreachable.
 * Claude Code renders this persistently in the status bar at the bottom of
 * the UI — it won't be overwritten by TUI redraws.
 *
 * Phase 1: Fetches ads from backend, caches locally, falls back to ads.json
 * Phase 2: Will include device key signature
 * Phase 3: Will submit impression data with PoW solution
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const BACKEND_URL = process.env.TOKEN_TRADER_BACKEND_URL || 'https://token-trader-api.fly.dev';
const LOCAL_ADS_PATH = path.join(__dirname, 'ads.json');
const CACHE_PATH = path.join(os.homedir(), '.token-trader', 'cached-ad.json');
const NONCE_PATH = path.join(os.homedir(), '.token-trader', 'pow-nonces.jsonl');
const AUTH_PATH = path.join(os.homedir(), '.token-trader', 'auth.json');
const NOTICE_PATH = path.join(os.homedir(), '.token-trader', 'session-notice.flag');
const FETCH_TIMEOUT_MS = 500;

// Phase 7: version header for the backend upgrade gate.
let PLUGIN_VERSION = '0.0.0';
try { PLUGIN_VERSION = require('../package.json').version; } catch (_) {}

/**
 * Read the device's public key from the saved auth file, if present.
 * Falls back to 'placeholder' for unauthenticated installs.
 */
function getDeviceKeyHeader() {
  try {
    const auth = JSON.parse(fs.readFileSync(AUTH_PATH, 'utf-8'));
    if (auth && auth.public_key) return auth.public_key;
  } catch (_) {
    // Not authenticated yet — fine, /ads/next is unauthenticated.
  }
  return 'placeholder';
}

/**
 * Fetch ad from backend API with timeout.
 */
async function fetchAdFromBackend() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const response = await fetch(`${BACKEND_URL}/api/v1/ads/next`, {
      headers: {
        'X-Device-Key': getDeviceKeyHeader(),
        'X-Plugin-Version': PLUGIN_VERSION,
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const ad = await response.json();

    // Cache the response locally for fallback
    try {
      const cacheDir = path.dirname(CACHE_PATH);
      if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir, { recursive: true });
      }
      fs.writeFileSync(CACHE_PATH, JSON.stringify(ad));
    } catch (_) {
      // Silently ignore cache write failures
    }

    // Store the PoW nonce for impression submission later (Phase 3)
    if (ad.pow_nonce) {
      try {
        const nonceDir = path.dirname(NONCE_PATH);
        if (!fs.existsSync(nonceDir)) {
          fs.mkdirSync(nonceDir, { recursive: true });
        }
        // Append to nonce log for later batching
        const entry = JSON.stringify({
          pow_nonce: ad.pow_nonce,
          ad_id: ad.id,
          timestamp: new Date().toISOString(),
        });
        fs.appendFileSync(NONCE_PATH, entry + '\n');
      } catch (_) {
        // Silently ignore nonce storage failures
      }
    }

    return ad;
  } catch (err) {
    // One-shot per-session notice: log once per Claude Code parent process.
    // We key on PPID (Claude Code is our parent) stored in a flag file, so
    // repeated statusline invocations within the same session stay silent.
    try {
      const ppid = String(process.ppid);
      const prior = fs.existsSync(NOTICE_PATH) ? fs.readFileSync(NOTICE_PATH, 'utf-8').trim() : '';
      if (prior !== ppid) {
        fs.mkdirSync(path.dirname(NOTICE_PATH), { recursive: true });
        fs.writeFileSync(NOTICE_PATH, ppid);
        const logLine = `${new Date().toISOString()} warn statusline: backend unreachable (${err.message || 'timeout'}) — using local fallback\n`;
        try { fs.appendFileSync(path.join(os.homedir(), '.token-trader', 'debug.log'), logLine); } catch (_) {}
      }
    } catch (_) {}
    return null;
  }
}

/**
 * Get fallback ad from cache or local ads.json.
 */
function getFallbackAd() {
  // Try cached ad from last successful backend fetch
  try {
    if (fs.existsSync(CACHE_PATH)) {
      return JSON.parse(fs.readFileSync(CACHE_PATH, 'utf-8'));
    }
  } catch (_) {
    // Silently ignore cache read failures
  }

  // Final fallback: local ads.json
  try {
    const ads = JSON.parse(fs.readFileSync(LOCAL_ADS_PATH, 'utf-8'));
    if (ads.length > 0) {
      return ads[Math.floor(Math.random() * ads.length)];
    }
  } catch (_) {
    // Silently ignore local ads read failures
  }

  return null;
}

/**
 * Word-wrap a string to the given width. Returns the original string if
 * width is falsy (not a TTY) or >= string length. Breaks on spaces; if a
 * single word exceeds the width, it gets hard-split.
 */
function wrapAd(text, width) {
  if (!width || width <= 0 || text.length <= width) return text;
  const words = text.split(' ');
  const lines = [];
  let current = '';
  for (const word of words) {
    if (!current) {
      current = word;
    } else if (current.length + 1 + word.length <= width) {
      current += ' ' + word;
    } else {
      lines.push(current);
      current = word;
    }
    // Hard-split any word longer than the width.
    while (current.length > width) {
      lines.push(current.slice(0, width));
      current = current.slice(width);
    }
  }
  if (current) lines.push(current);
  return lines.join('\n');
}

/**
 * Remove the statusLine entry from ~/.claude/settings.json so ads stop.
 * Used for self-cleanup when the plugin is uninstalled without logout.
 */
function removeStatusLine() {
  try {
    const settingsPath = path.join(os.homedir(), '.claude', 'settings.json');
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    if (settings.statusLine && settings.statusLine.command &&
        settings.statusLine.command.includes('statusline-ad.js')) {
      delete settings.statusLine;
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
    }
  } catch (_) {}
}

/**
 * Check whether the plugin is still installed by reading Claude Code's
 * installed_plugins.json registry.  Returns true when token-trader appears
 * in the plugins map; false otherwise (including on read/parse errors).
 */
function isPluginInstalled() {
  try {
    const installedPath = path.join(os.homedir(), '.claude', 'plugins', 'installed_plugins.json');
    const data = JSON.parse(fs.readFileSync(installedPath, 'utf-8'));
    const plugins = data.plugins || {};
    return Object.keys(plugins).some(k => k.toLowerCase().includes('token-trader'));
  } catch (_) {
    return false;
  }
}

/**
 * Main: fetch ad and print to stdout.
 */
(async () => {
  // If the plugin has been uninstalled (or the user logged out), clean up
  // the statusLine setting so ads stop even without an explicit logout.
  if (!fs.existsSync(AUTH_PATH) || !isPluginInstalled()) {
    removeStatusLine();
    process.exit(0);
  }

  let ad = await fetchAdFromBackend();

  if (!ad) {
    ad = getFallbackAd();
  }

  if (!ad || !ad.text) {
    // No ad available — exit silently
    process.exit(0);
  }

  // Print to stdout — Claude Code displays this in the status line.
  // Wrap to terminal width so shrunk windows don't clip the ad.
  process.stdout.write(wrapAd(`[ad] ${ad.text}`, process.stdout.columns));
  process.exit(0);
})().catch(() => {
  process.exit(0);
});
