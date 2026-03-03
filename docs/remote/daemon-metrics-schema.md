# Remote Daemon Metrics Schema

This document defines the production metrics contract for the remote daemon.
It is the source of truth for metric names, labels, units, and semantic rules.

## Scope

Covers four metric domains:

- Session lifecycle
- Command execution
- Reconnect behavior
- Error-rate taxonomy

## Conventions

- Prefix: `aih_remote_daemon_`
- Types: Counter, Gauge, Histogram
- Histogram buckets: fixed and versioned in code; any bucket change requires release note
- Labels should stay low-cardinality; never use raw user content as labels
- `workspace_id` and `session_id` are not labels; expose only aggregated cardinality-safe labels

## Common Labels

All metrics may include these labels when applicable:

- `env`: `prod | staging | dev`
- `region`: deployment region (for example `us-east-1`)
- `daemon_version`: semantic version string
- `protocol_version`: control protocol version

Domain-specific labels are listed per metric below.

## Session Lifecycle Metrics

### `aih_remote_daemon_sessions_started_total`

- Type: Counter
- Unit: sessions
- Labels: `env`, `region`, `daemon_version`, `protocol_version`, `entrypoint` (`cli|desktop|mobile`)
- Meaning: increments once when a session is successfully created in daemon state.

### `aih_remote_daemon_sessions_ended_total`

- Type: Counter
- Unit: sessions
- Labels: common + `end_reason` (`client_exit|timeout|daemon_shutdown|error|operator_kill`)
- Meaning: increments once when a tracked session transitions to terminal state.

### `aih_remote_daemon_sessions_active`

- Type: Gauge
- Unit: sessions
- Labels: common
- Meaning: current number of active sessions held by daemon.

### `aih_remote_daemon_session_lifetime_seconds`

- Type: Histogram
- Unit: seconds
- Labels: common + `end_reason`
- Meaning: observed session duration from created to ended.

## Command Execution Metrics

### `aih_remote_daemon_commands_started_total`

- Type: Counter
- Unit: commands
- Labels: common + `command_family` (`run|exec|sync|control`)
- Meaning: increments when command enters execution queue.

### `aih_remote_daemon_commands_completed_total`

- Type: Counter
- Unit: commands
- Labels: common + `command_family`, `result` (`ok|error|timeout|canceled`)
- Meaning: increments on terminal command outcome.

### `aih_remote_daemon_command_duration_seconds`

- Type: Histogram
- Unit: seconds
- Labels: common + `command_family`, `result`
- Meaning: end-to-end execution latency for completed commands.

### `aih_remote_daemon_command_queue_depth`

- Type: Gauge
- Unit: commands
- Labels: common
- Meaning: current queue depth awaiting execution.

## Reconnect Metrics

### `aih_remote_daemon_reconnect_attempts_total`

- Type: Counter
- Unit: attempts
- Labels: common + `client_type` (`cli|desktop|mobile`), `reason` (`network_drop|token_refresh|daemon_restart`)
- Meaning: increments for each reconnect attempt observed by daemon.

### `aih_remote_daemon_reconnect_success_total`

- Type: Counter
- Unit: attempts
- Labels: common + `client_type`
- Meaning: reconnect attempts that restored a valid session channel.

### `aih_remote_daemon_reconnect_duration_seconds`

- Type: Histogram
- Unit: seconds
- Labels: common + `client_type`, `result` (`ok|failed`)
- Meaning: elapsed time from reconnect start to terminal result.

### `aih_remote_daemon_reconnect_inflight`

- Type: Gauge
- Unit: attempts
- Labels: common + `client_type`
- Meaning: currently in-progress reconnect attempts.

Derived indicator (query-level):

- `reconnect_success_rate = reconnect_success_total / reconnect_attempts_total`

## Error-Rate Taxonomy

### `aih_remote_daemon_errors_total`

- Type: Counter
- Unit: errors
- Labels: common +
  - `error_domain`: `auth|network|protocol|runtime|workspace|internal|dependency`
  - `error_code`: stable machine-readable code (for example `AUTH_TOKEN_EXPIRED`)
  - `severity`: `warn|error|critical`
  - `recoverability`: `auto|manual|fatal`
- Meaning: canonical error counter for daemon-side failures.

### `aih_remote_daemon_error_events_dropped_total`

- Type: Counter
- Unit: events
- Labels: common + `reason` (`rate_limited|buffer_overflow|invalid_payload`)
- Meaning: errors not emitted due to protection mechanisms.

Derived indicators (query-level):

- `daemon_error_rate = rate(errors_total[5m]) / rate(commands_started_total[5m])`
- `critical_error_share = rate(errors_total{severity="critical"}[5m]) / rate(errors_total[5m])`

## Semantic Rules

- Counter resets are expected only on process restart; dashboards must use `rate()`/`increase()`.
- `result` and `end_reason` are mutually exclusive dimensions in their own metric families.
- `error_code` values must be declared in code constants and reviewed before adding new values.
- Any new label or enum value requires updating this document and changelog.

## Instrumentation Checklist

- Add metric registration on daemon startup.
- Emit session lifecycle events at state transitions only.
- Record command duration with a single monotonic timer source.
- Emit reconnect metrics for both success and failure paths.
- Map all daemon exceptions to `error_domain` and `error_code` before emission.

## Versioning

- Schema version: `v1`
- Effective date: `2026-03-01`
- Backward compatibility: adding new metrics is allowed; renaming/removing existing metrics requires a major schema revision (`v2`).
