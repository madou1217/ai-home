# Mobile Weak-Network Test Matrix

## Scope
- Product: mobile command center flows (`Session`, `Task`, `Ops Quick Actions`, push refresh).
- Environment: Wi-Fi, 4G/5G, and network transitions during active sessions.
- Objective: verify user-facing behavior under packet loss, high latency, and intermittent disconnect.

## Test Dimensions
- Devices: at least one iOS and one Android release target.
- Account state: valid account configured and a secondary account available for switch fallback.
- Runtime state: idle dashboard, active command session, and background-to-foreground resume.

## Scenario Matrix
| Scenario | Network Profile | Trigger Steps | Expected UI Hints | Expected Recovery Outcome |
| --- | --- | --- | --- | --- |
| WN-01 Packet loss burst | 10%-20% packet loss, stable bandwidth | Open Session screen, run quick status refresh 5 times | Non-blocking warning banner, last-success timestamp preserved, retry action visible | Auto retry (backoff) completes within 3 attempts; no duplicate command execution |
| WN-02 Sustained high latency | RTT 800-1500ms, low jitter | Start command from Task screen, keep app foregrounded | Inline loading state remains responsive; hint text indicates slow network instead of generic failure | Request eventually succeeds or times out with actionable retry; input remains intact |
| WN-03 Intermittent disconnect | 15s offline every 45s cycle | Keep Session screen active for 5 minutes | Connection state chip toggles to reconnecting/offline; toast explains degraded realtime updates | Reconnect manager restores stream automatically after connectivity returns; no app restart required |
| WN-04 Network handover | Wi-Fi -> cellular during active refresh | Trigger manual refresh, switch network mid-request | One transient warning at most; no UI freeze; spinner state remains bounded | In-flight request is canceled or retried once; final state consistent with latest server response |
| WN-05 Background resume under weak net | App background 2 minutes under high latency then resume | Enter Session screen, send app to background, return and refresh | Resume hint indicates stale data window; controls remain tappable | Cached state shown immediately; background sync updates view once connection stabilizes |
| WN-06 Push arrival during partial outage | Intermittent disconnect + delayed push delivery | Simulate push while link flaps | Notification badge can lag but does not spam; in-app note indicates delayed sync | Once online, badge/count converges to server truth without duplicate alerts |

## Pass/Fail Rules
- Pass: all scenarios provide explicit user hints plus a deterministic recovery path (auto or manual) without data loss or duplicated actions.
- Fail: silent failure, frozen loading state, or requiring force-close/relogin for recovery.

## Evidence Checklist
- Capture per-scenario screen recording or screenshots for hint and recovery states.
- Record attempt count, time-to-recover, and final outcome in QA notes.
- Attach logs for reconnect attempts and request timeouts when a scenario fails.
