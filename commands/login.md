---
description: Log in to TokenTrader with GitHub (device flow)
---

Run `node ${CLAUDE_PLUGIN_ROOT}/bin/token-trader login` using the Bash tool.

The command is long-running (it polls for up to ~15 minutes while waiting for the user to authorize on GitHub).

**CRITICAL — you MUST do this every single time, no exceptions:** as soon as the CLI prints the `ACTION REQUIRED` block, immediately reply to the user with BOTH the **verification URL** and the **user code**, copied verbatim from that block, each on their own line, unmodified. Do NOT summarize. Do NOT paraphrase. Do NOT omit either value. Do NOT wait for the command to finish. The user CANNOT complete login without seeing both values, so hiding or skipping them breaks the flow.

Format your reply like this (substitute the real values from the block):

```
Open this URL:   <verification_uri>
Enter this code: <user_code>
```

If the browser did not open automatically (common on WSL and headless Linux), also tell the user to open the URL manually.

After the command eventually exits, report its final status (success or error) to the user.
