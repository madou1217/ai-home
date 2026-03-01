# Mobile Analytics Event Taxonomy

## Scope
This document defines analytics events for the mobile command-center core journeys:
- session lifecycle visibility
- task trigger and result tracking
- quick control actions (retry, stop, switch account)

The taxonomy is designed for product insight, reliability monitoring, and GA readiness reviews.

## Shared Event Envelope
All events MUST include the following base properties:

| Property | Type | Required | Notes |
| --- | --- | --- | --- |
| `event_name` | string | yes | canonical snake_case event name |
| `event_version` | integer | yes | starts at `1`; increment for breaking schema change |
| `event_id` | string | yes | UUID for deduplication |
| `occurred_at` | string | yes | ISO8601 UTC timestamp |
| `platform` | string | yes | fixed `mobile` |
| `app_version` | string | yes | semantic app version |
| `build_number` | string | yes | mobile build identifier |
| `environment` | string | yes | `prod` / `staging` / `dev` |
| `account_id_hash` | string | yes | salted irreversible hash |
| `session_id` | string | no | populated when action is tied to a live session |
| `task_id` | string | no | populated when action is tied to a task |
| `network_type` | string | no | `wifi` / `cellular` / `offline` / `unknown` |

## Event List

### 1. Session Journey

#### `mobile_session_view_opened`
When user opens session screen.

Required properties:
- `entry_point`: `tab` | `push_notification` | `deep_link`
- `has_active_session`: boolean

Sampling:
- 100% in all environments.

#### `mobile_session_status_rendered`
When status card is rendered with a resolved state.

Required properties:
- `status_state`: `healthy` | `connecting` | `reconnecting` | `offline` | `degraded`
- `status_priority`: `p0` | `p1` | `p2`
- `data_freshness_ms`: integer

Sampling:
- 20% in `prod`.
- 100% in non-prod.

#### `mobile_reconnect_attempted`
When reconnect manager starts a reconnect attempt.

Required properties:
- `attempt_index`: integer (1-based)
- `backoff_ms`: integer
- `trigger_reason`: `transport_error` | `heartbeat_timeout` | `manual_retry`

Sampling:
- 100% for first 3 attempts per session.
- 25% for attempts >= 4 in `prod`.

#### `mobile_reconnect_result`
When reconnect attempt completes.

Required properties:
- `attempt_index`: integer
- `result`: `success` | `failed`
- `failure_reason`: `timeout` | `auth_invalid` | `network_unreachable` | `server_error` | `unknown` (required when `result=failed`)
- `duration_ms`: integer

Sampling:
- 100% for `failed`.
- 50% for `success` in `prod`.
- 100% in non-prod.

### 2. Task Journey

#### `mobile_task_triggered`
When user triggers a task from task screen.

Required properties:
- `task_type`: string
- `trigger_source`: `task_screen` | `quick_action`
- `queue_depth_at_trigger`: integer

Sampling:
- 100%.

#### `mobile_task_result_received`
When task completes with terminal state.

Required properties:
- `task_type`: string
- `result_state`: `success` | `failed` | `cancelled`
- `duration_ms`: integer
- `error_code`: string (required when `result_state=failed`)
- `retryable`: boolean

Sampling:
- 100% for `failed` and `cancelled`.
- 50% for `success` in `prod`.
- 100% in non-prod.

#### `mobile_task_error_presented`
When UI renders actionable error to user.

Required properties:
- `error_code`: string
- `error_category`: `network` | `auth` | `quota` | `runtime` | `unknown`
- `primary_cta`: `retry` | `switch_account` | `view_logs` | `dismiss`

Sampling:
- 100%.

### 3. Quick Actions Journey

#### `mobile_quick_action_tapped`
When user taps quick action control.

Required properties:
- `action_name`: `retry` | `stop` | `switch_account`
- `surface`: `ops_quick_actions_panel`

Sampling:
- 100%.

#### `mobile_quick_action_result`
When quick action returns terminal result.

Required properties:
- `action_name`: `retry` | `stop` | `switch_account`
- `result`: `success` | `failed`
- `latency_ms`: integer
- `failure_reason`: `timeout` | `invalid_state` | `transport_error` | `unknown` (required when `result=failed`)

Sampling:
- 100% for `failed`.
- 30% for `success` in `prod`.
- 100% in non-prod.

## Privacy Boundary
- Do not send raw account names, task payload content, free-text logs, prompts, or message bodies.
- Do not include direct identifiers (email, phone, token, API key, device serial).
- `account_id_hash` must use salted one-way hashing managed by application runtime.
- For error diagnostics, emit normalized `error_code`/`error_category` only.

## Retention Boundary
- Raw event retention:
  - `prod`: 90 days
  - `staging`: 30 days
  - `dev`: 14 days
- Aggregated metrics retention: 400 days.
- Deduplication key (`event_id`) retention: 7 days.
- Deletion SLA for user/account-level erase requests: within 30 days.

## Quality Rules
- Events violating required-property schema must be dropped at ingestion and counted in `analytics_schema_reject_total`.
- Event version migrations must support one version overlap window before old version removal.
- Dashboard and alert definitions must only use fields listed in this taxonomy.
