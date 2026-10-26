# Usage log — Agent 1 (Account 1)

Agent 1 usage = the five-hour window's utilization on Account 1, read from this Claude Code session's own
rate-limit events (`list_events`, kind `rate_limit_event`, field `unifiedWindows.five_hour.utilization`).
Readings lag a few minutes, so 88 % counts as 90 %. When the newest reading is old, write
`54 (newest reading HH:MM)`. Times in IST (Asia/Kolkata). A second agent, if one joins, keeps its own
log in `usage-log-agent-2.md`. Only Agent 1 writes this file; add one row per check, never edit old rows.

| Time (IST) | Agent | Account | Usage % | Remaining % | Resets at (IST) | Step |
|-------------|-------|---------|---------|-------------|------------------|------|
| 2026-10-26 18:50 | Agent 1 | Account 1 | 67 (reading 18:46) | 33 | 2026-10-26 21:20 | resumed in a fresh container; wave 1 launched with 3 builders (0/176 tasks landed) |
