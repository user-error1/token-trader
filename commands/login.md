---
description: Log in to TokenTrader with GitHub (device flow)
---

Run `node ${CLAUDE_PLUGIN_ROOT}/bin/token-trader login` with **`run_in_background: true`**.

The CLI writes all user-facing messages (verification URL, user code, progress, errors) directly to `/dev/tty`, so the user sees them in their real terminal immediately — no action required from you while it runs. The command polls GitHub for up to ~9 minutes waiting for authorization.

When the background command completes, reply to the user with one short sentence summarizing the outcome — either "Login succeeded." or a one-line version of the error from the output file. Do not echo the URL or code; they were already shown to the user during the flow.
