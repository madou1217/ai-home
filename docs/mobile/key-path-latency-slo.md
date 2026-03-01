# Mobile Key-Path Latency SLO

## Scope
This document defines latency targets and measurement points for user-visible mobile command-center actions. It focuses on end-to-end perceived latency from user trigger to meaningful UI feedback.

## SLO Model

### Measurement Principles
- Record client timestamps at trigger and first meaningful response boundary.
- Calculate latency in milliseconds as `t_feedback - t_trigger`.
- Report p50 and p95 per key path in rolling 7-day and 30-day windows.
- Exclude sessions with app process kill/background suspension mid-flight.

### SLO Severity Policy
- `healthy`: p95 meets target.
- `warning`: p95 exceeds target for 15 consecutive minutes.
- `breach`: p95 exceeds target for 60 consecutive minutes or 3 warnings in 24 hours.
- Breach requires incident record with owner, root cause, and recovery ETA.

## Key Paths And Targets

| Key Path | User Trigger | Meaningful Feedback Boundary | p50 Target | p95 Target |
| --- | --- | --- | --- | --- |
| Session status refresh | Pull-to-refresh / auto refresh tick | Fresh status card rendered with updated timestamp | <= 400ms | <= 1200ms |
| Task start action | Tap "Start Task" | UI transitions to running/pending state with task id | <= 500ms | <= 1500ms |
| Task stop/retry quick action | Tap quick action button | Action button state settles to success/failure and toast/banner shown | <= 450ms | <= 1300ms |
| Reconnect recovery | Network restored while reconnect manager active | Session screen leaves offline/reconnecting state and control buttons enabled | <= 800ms | <= 2500ms |
| Push-to-inbox reflection | Push notification received and opened | Task detail screen displays event-correlated status/log section | <= 700ms | <= 2200ms |

## Instrumentation Points

### 1) Session Status Refresh
- `mobile_session_refresh_tap` at refresh trigger.
- `mobile_session_refresh_response` when API returns success/failure.
- `mobile_session_refresh_rendered` when status card commit/render finishes.
- SLO latency uses `tap -> rendered`.

### 2) Task Start
- `mobile_task_start_tap` at user action.
- `mobile_task_start_accepted` when backend accepts trigger and returns task handle.
- `mobile_task_start_state_rendered` when running/pending state appears.
- SLO latency uses `tap -> state_rendered`.

### 3) Quick Actions (Stop/Retry/Switch)
- `mobile_quick_action_tap` with `action_type`.
- `mobile_quick_action_response` with `result`.
- `mobile_quick_action_settled` when control leaves loading state and outcome is visible.
- SLO latency uses `tap -> settled`.

### 4) Reconnect Recovery
- `mobile_reconnect_attempt_started` on reconnect cycle.
- `mobile_reconnect_transport_restored` when connectivity check succeeds.
- `mobile_reconnect_ui_recovered` when offline hint cleared and interactions restored.
- SLO latency uses `attempt_started -> ui_recovered`.

### 5) Push Reflection
- `mobile_push_opened` when user opens push-linked entry.
- `mobile_push_context_loaded` when payload correlation resolved.
- `mobile_push_target_rendered` when target task/session state is visible.
- SLO latency uses `push_opened -> target_rendered`.

## Alerting And Ownership
- Primary owner: mobile on-call engineer for the current release train.
- Secondary owner: backend daemon on-call when breach correlates with upstream latency.
- Alert channels: `#mobile-ops-alerts` and incident tracker with severity mapping.
- Weekly review includes top p95 regressions, release deltas, and unresolved breach actions.

## Reporting Requirements
- Dashboard must slice by app version, platform (iOS/Android), network class (wifi/4g/weak), and region.
- All key paths require event volume guardrail: at least 200 valid samples/day before SLO evaluation.
- Any key path below sample guardrail is marked `insufficient_data` and excluded from pass/fail.
