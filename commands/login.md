---
description: Log in to TokenTrader with GitHub (device flow)
---

Run `node ${CLAUDE_PLUGIN_ROOT}/bin/token-trader login` using the Bash tool.

The command is long-running (it polls for up to ~15 minutes while waiting for the user to authorize on GitHub). As soon as the CLI prints the `ACTION REQUIRED` block, stop and reply to the user with the **verification URL and the user code** copied verbatim from that block — on their own lines, unmodified — so they can click the link and paste the code. Do not wait for the command to finish before surfacing these to the user; they need them immediately. If the browser did not open automatically (common on WSL and headless Linux), tell the user to open the URL manually.

After the command eventually exits, report its final status (success or error) to the user.
