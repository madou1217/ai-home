# Client Session And Serve Control API Contract

Last updated: 2026-03-02

## Scope
- Client-visible session continuity query/continue contract.
- Client-visible proxy serve control contract (restart + config apply).

## Session Continuity

### Session List
- Command: `aih codex plan-sessions [plan]`
- Success shape:
  - `plan`: string (plan path)
  - `task_id`: string (`T001` style)
  - `task_key`: string (`m6-t001-cs001` style)
  - `session_id`: string (UUID-like)
  - `binding_state`: string (`ATTACHED|MISSING_SESSION_BINDING|...`)

### Last Session Lookup
- Command: `aih codex last-session`
- Success shape:
  - `session_id`: string
  - `updated_at`: ISO8601 string
  - `cwd`: string

### Continue Session
- Command: `aih codex auto exec resume <session_id> [prompt]`
- Success:
  - Exit code `0`.
  - Output includes resolved `resume` command and starts target session.
- Error (stable machine-readable text):
  - `No session_id found. Use \`aih codex sessions\` first, then run: aih codex auto exec resume <session_id> [prompt]`
  - `Unsupported --prompt syntax. Use positional prompt: aih codex auto exec resume <session_id> "你写到哪里了"`
  - `session_not_found` (planned normalized code for missing/expired session bindings)

## Serve Control

### Local CLI Control
- `aih proxy restart [serve args]`
- `aih proxy serve --port <n> --management-key <key> --client-key <key> ...`
- Success shape (CLI):
  - restart success: `proxy restarted in background (pid=<pid>)`
  - includes fixed connection hints: `base_url`, `api_key`
- Error shape (CLI):
  - `proxy restart failed: <message>`
  - `proxy start failed: <message>`

### Management Endpoints (HTTP)
- Auth: `Authorization: Bearer <management-key>` when key is configured.
- Current stable endpoints:
  - `GET /v0/management/status`
  - `GET /v0/management/metrics`
  - `GET /v0/management/accounts`
  - `GET /v0/management/models`
  - `POST /v0/management/reload`
  - `POST /v0/management/cooldown/clear`
- Common error payloads:
  - Unauthorized: `{ "ok": false, "error": "unauthorized_management" }`
  - Unknown management path: `{ "ok": false, "error": "management_not_found" }`

### Restart/Apply Contract (current stable)
- Endpoint: `POST /v0/management/restart`
- Request payload:
  - `port`: number (optional)
  - `api_key`: string (optional)
  - `management_key`: string (optional)
- Success payload:
  - `ok`: boolean
  - `action`: string (`restart`)
  - `running`: boolean
  - `pid`: number
  - `started`: boolean
  - `stopped`: object (`stopped/reason/forced`)
  - `appliedConfig`: object
- Error payload:
  - `ok`: false
  - `error`: string
  - `message`: string (optional)

## Session Continuity Contract
- Canonical CLI entrypoints:
  - `aih codex sessions`
  - `aih codex auto exec resume <session_id> [prompt]`
- Canonical not-found/error marker:
  - `session_not_found`

## Proxy Serve Control Contract
- Canonical management endpoints include:
  - `GET /v0/management/status`
  - `POST /v0/management/restart`

## Desktop Bridge Contract
- Stable tauri command surface:
  - `proxy_namespace_info`
  - `proxy_status`
  - `proxy_restart`
  - `proxy_set_port`
  - `proxy_set_api_key`
