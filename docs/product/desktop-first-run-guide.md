# Desktop First-Run Guide

## Purpose
This guide helps a new user complete the first successful desktop launch flow for AI Home.

## Prerequisites
- A supported desktop environment with network access.
- `aih` installed and available in `PATH`.
- At least one runnable account profile configured in `~/.ai_home`.

## First-Run Flow

### 1. Start the desktop app
1. Open the desktop app build for your platform.
2. Wait for the initial health check to finish.
3. Confirm the dashboard shows runtime status as healthy.

### 2. Validate local account visibility
1. Open the account/session launcher view.
2. Verify at least one profile appears in the account list.
3. If nothing appears, run `aih ls` in terminal and re-open the launcher.

### 3. Create your first session
1. Select one account profile.
2. Choose default workspace and sandbox options.
3. Click launch and wait for a session-ready state.

Expected result:
- A session card appears with connected status.
- No startup error banner is shown.

### 4. Execute a smoke command
1. In the active session, run a basic command such as:

```bash
aih ls
```

2. Confirm output returns without transport/runtime errors.

Expected result:
- Command completes successfully.
- Activity/audit view records the command event.

## Post-Run Checks
- Session status remains healthy for at least 60 seconds.
- Account switch still works after first command.
- Closing and reopening the app preserves default account selection.

## Troubleshooting

### No accounts in launcher
- Verify profile data exists under `~/.ai_home`.
- Re-run CLI account checks: `aih ls` and `aih <provider> ls`.

### Session launch fails
- Check desktop diagnostics/doctor output.
- Confirm selected workspace path is readable/writable.
- Retry with a minimal sandbox profile.

### Command execution fails immediately
- Check network/proxy settings.
- Validate provider auth in the selected profile.
- Inspect audit log details for the exact failure reason.

## Exit Criteria (First-Run Complete)
A first run is considered complete when all items below are true:
- Desktop app launches to healthy dashboard state.
- At least one account is visible and selectable.
- A session is created successfully.
- At least one command executes successfully.
- Audit trail captures the command event.
