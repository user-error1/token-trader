---
description: Log in to TokenTrader with GitHub (device flow)
---

Claude Code truncates Bash tool stdout in its UI, which would hide the GitHub verification URL and user code. The only channel that reliably reaches the user uncut is **your text response**, so this skill is built around reading the URL and code from a small JSON file and echoing them in your reply.

**Step 1 — start the login command in the background:**

```
Bash with run_in_background: true:
  node ${CLAUDE_PLUGIN_ROOT}/bin/token-trader login
```

**Step 2 — read the pending-login file the CLI writes:**

```
Bash:
  sleep 2 && cat ~/.token-trader/.pending-login.json
```

(The `sleep 2` lets the CLI hit the GitHub backend and write the file. It's a one-shot wait, not a poll loop.)

The file contains JSON like:

```json
{
  "verification_uri": "https://github.com/login/device",
  "user_code": "ABCD-EFGH",
  "created_at": "...",
  "expires_at": "..."
}
```

**Step 3 — reply to the user with both values, copied verbatim, in this exact format:**

```
Open this URL:   <verification_uri>
Enter this code: <user_code>
```

Do not summarize, paraphrase, or omit either value. The user cannot complete login without seeing both.

**Step 4 — wait for the background command to complete** (you'll get an automatic notification). When it does, read the last few lines of the background command's output file (the path was returned in Step 1) and report the outcome to the user in one short sentence — either "Login succeeded." or a one-line version of the error message.

**Notes:**
- If `cat` in Step 2 fails because the file doesn't exist yet, the CLI hasn't reached GitHub yet. Wait another 2 seconds and try once more — but only once. If it still fails, report the failure and stop.
- If the browser didn't open automatically (common on WSL and headless Linux), the user opens the URL manually — no special handling needed from you.
