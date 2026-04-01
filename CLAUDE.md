# TokenTrader — Claude Code Plugin

A Claude Code plugin that displays unobtrusive 1-line ASCII sponsored messages in the terminal. Ads render when the user submits a prompt (via the `UserPromptSubmit` hook), using ANSI dim styling. Impressions are logged locally.

## Project Structure

```
.claude-plugin/plugin.json   Plugin metadata (name, version, hook reference)
hooks/hooks.json              Hook configuration (UserPromptSubmit event)
scripts/statusline-ad.js      Status line script — picks and displays a random ad
scripts/show-ad.js            Stop hook — logs impressions (no display)
scripts/show-ad.sh            Shell entry point — forwards stdin to show-ad.js
scripts/ads.json              Ad inventory (array of {id, advertiser, text})
install.sh                    One-time installer — patches ~/.claude/settings.json
data/                         Reserved for future local data
```

## How It Works

1. Claude Code's `statusLine` feature calls `statusline-ad.js` to display the ad persistently in the status bar at the bottom of the UI
2. The `Stop` hook fires `show-ad.js` after each response to log impressions to `~/.token-trader/impressions.jsonl`

### Ad Placement

Ads render in Claude Code's **status line** — a persistent bar at the bottom of the terminal UI. Unlike writing to `/dev/tty` (which gets overwritten by TUI redraws), the status line is managed by Claude Code itself and persists across all UI states: idle prompt, thinking, and after responses.

## Ad Format

- Pure ASCII, single line, rendered in terminal's native font
- Max **120 characters** including the `[ad]` prefix (5 chars)
- Displayed with ANSI dim escape (`\x1b[2m`) so it's visible but unobtrusive
- No images, animation, or color injection

Example:
```
[ad] SecureLLMs.org: Private AI / LLM infra for your buiz. Book demo → securellms.org
```

## Ad Inventory Format (`ads.json`)

```json
[
  {
    "id": "unique_ad_id",
    "advertiser": "CompanyName",
    "text": "Ad copy here, max 115 chars (120 minus '[ad] ' prefix)"
  }
]
```

## Impression Log

Written to `~/.token-trader/impressions.json`. Each entry:
```json
{
  "timestamp": "ISO-8601",
  "session_id": "from hook data",
  "ad_id": "matching ads.json id",
  "advertiser": "company name"
}
```

## Installation

```bash
git clone <repo-url>
cd token-trader
./install.sh
```

The installer:
1. Symlinks the plugin into `~/.claude/plugins/token-trader`
2. Registers a `Stop` hook in `~/.claude/settings.json`
3. Cleans up any legacy `UserPromptSubmit` or `PermissionRequest` hooks from earlier versions

**Run `install.sh` when Claude Code is not running** to avoid settings being overwritten.

## Development Notes

- Hook output goes to `/dev/tty`, NOT stdout — stdout is consumed by Claude Code as system context
- The hook must exit cleanly (exit 0) even on failure — a non-zero exit blocks Claude Code
- The `Stop` hook fires after Claude's response — the ad renders in the prompt area while the user reads the output
- Ads fail silently in non-interactive environments (CI, no `/dev/tty`)
