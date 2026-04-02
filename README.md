# TokenTrader

**Earn back your Claude Code subscription by running small, non-invasive ads in your terminal.**

TokenTrader is a Claude Code plugin that displays lightweight sponsored messages in the status bar while you work. You use Claude Code like normal — we show a single line of text at the bottom of your terminal and use the ad revenue to offset your subscription cost.

No popups. No banners. No interruptions. Just one dim line of ASCII text while you code.

```
───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯ Normal prompt here, get paid while you vibe code!                                                                                                                                                 
───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
[ad] SecureLLMs.org: Secure AI/LLM deployments for the enterprise. Book demo → securellms.org
```

## How It Works

1. The plugin displays a single sponsored message in Claude Code's **status line** — the persistent bar at the bottom of the terminal.
2. After each Claude response, a verified impression is logged.
3. Earn enough impressions and you receive a free month of Claude Pro.

> **Roadmap:** We're working toward a direct Anthropic integration where ad revenue applies as credits against your usage limits automatically. If you're on the Anthropic team and interested in making this happen — we'd love to talk.

Ads are plain text, capped at 120 characters, and rendered with dim styling so they stay out of your way. No images, animation, or color injection.

## Installation

```bash
git clone <repo-url>
cd token-trader
./install.sh
```

The installer registers the plugin with Claude Code by updating `~/.claude/settings.json`.

> Run `install.sh` when Claude Code is **not** running to avoid settings being overwritten.

Restart Claude Code after installing.

## About This Project

The TokenTrader plugin is **open source** — you can review, audit, and verify it doesn't log your keystrokes or content. However, it only works with the official TokenTrader backend at `backend.example.com`. The backend (impression verification, fraud detection, advertiser management, credit system) is proprietary and closed source.

## Ad Format

- Pure ASCII, single line, terminal-native font
- Max 120 characters including the `[ad]` prefix
- Dim ANSI styling — visible but unobtrusive
- No click required — URLs are displayed as plain text

## Privacy

- No keystrokes or content are logged
- Impression data includes only: timestamp, session ID, ad ID
- Logs are stored locally at `~/.token-trader/impressions.jsonl` before being synced to the backend

## License

MIT
