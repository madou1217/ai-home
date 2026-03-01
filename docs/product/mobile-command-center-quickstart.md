# Mobile Command Center Quickstart

## Audience
This guide is for operators who need to monitor sessions, trigger tasks, and recover from failures using the mobile command center.

## What You Need
- Mobile app build with command-center access.
- Valid account signed in to `aih` backend.
- Network access to the daemon endpoint used by your environment.

## 10-Minute First Run

### 1. Open Session Overview
1. Launch the app and open `Session`.
2. Confirm the top status card shows one of: `healthy`, `connecting`, `reconnecting`, `offline`, `degraded`.
3. Pull to refresh once and verify the timestamp updates.

Expected result:
- Session state renders without blocking errors.
- Status and freshness information are visible above logs.

### 2. Trigger a Task
1. Open `Task` screen.
2. Select a task type and trigger execution.
3. Stay on screen and watch state move from queued/running to terminal result.

Expected result:
- Trigger feedback appears immediately.
- Terminal result includes `success`, `failed`, or `cancelled` with clear state text.

### 3. Use Quick Actions
1. Open `Ops Quick Actions`.
2. Execute `retry` for a failed or reconnecting flow.
3. Execute `stop` on an in-flight task only when needed.
4. Execute `switch account` and return to the original account.

Expected result:
- Each action returns terminal feedback.
- Failed actions show actionable reason and next step.

### 4. Verify Recovery UX Under Weak Network
1. Simulate temporary network loss.
2. Observe reconnect hint and retry affordance.
3. Restore network and verify state recovers.

Expected result:
- Reconnect attempts are visible.
- User can manually retry without leaving the main flow.

## Operator Playbook

### If Task Trigger Fails
1. Check error code/category in task result.
2. Run `retry` from quick actions.
3. If still failing, switch account once to rule out account-scoped issues.
4. Escalate with screenshot + task/session IDs.

### If Session Stays Offline
1. Validate network type and backend reachability.
2. Pull to refresh and wait for reconnect cycle.
3. Trigger manual retry.
4. Escalate if offline state persists for more than 5 minutes.

## Verification Checklist (Release Candidate)
- [ ] Session screen opens and status card renders correctly.
- [ ] Task trigger path reaches terminal state.
- [ ] Quick actions (`retry`, `stop`, `switch account`) behave as expected.
- [ ] Offline/reconnect path is visible and recoverable.
- [ ] Error states provide an actionable next step.

## Evidence to Attach
- Build/version tested.
- Device/OS used.
- Timestamped screenshots of session status, task terminal state, and one quick action result.
- Any blocker with reproduction steps and observed error code.
