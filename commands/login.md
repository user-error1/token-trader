---
description: Log in to TokenTrader with GitHub (device flow)
---

Run `node ${CLAUDE_PLUGIN_ROOT}/bin/token-trader login` using the Bash tool with **`timeout: 600000`** (10 minutes, the Bash tool's maximum). This holds the terminal while the CLI polls GitHub for authorization so the user is never left hanging.

**CRITICAL — do NOT run this command in the background.** Background mode breaks the auth flow: the process runs without being awaited, so when the user completes GitHub auth there is nothing that reliably reports success back. Always run foreground/blocking.

The CLI will print an `ACTION REQUIRED` block containing the verification URL and user code, then poll for up to ~9 minutes while the user authorizes on GitHub. The user sees the block live in their terminal.

When the command completes:
- On success, surface the final confirmation lines (authorized username, device registration status) to the user.
- On error or timeout, report the error message and tell the user to re-run `/token-trader:login`.
- If the browser did not open automatically (common on WSL and headless Linux), and the command is still polling, remind the user to open the URL manually — but only if you can read the URL from the output; otherwise just report what happened.
