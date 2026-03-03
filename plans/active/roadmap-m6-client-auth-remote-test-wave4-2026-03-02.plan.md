# Plan: m6-client-auth-remote-test-wave4

- plan_id: m6-client-auth-remote-test-wave4-2026-03-02
- coordinator: codex
- created_at: 2026-03-02T12:40:54+08:00
- updated_at: 2026-03-03T11:49:04+08:00
- status: active

## Global Rules
- Single source of truth: this file only.
- Claim before coding.
- One AI can hold multiple tasks only if scopes do not overlap.

## TodoList
- [ ] Add OAuth login orchestration and profile credential config support.
- [ ] Add client-side auth configuration entry points.
- [ ] Add remote project E2E test coverage for session/reconnect and workspace operations.
- [ ] Add client E2E test coverage for auth/session/serve operations.

## Checklist
- [ ] T001 OAuth login orchestrator module
- [ ] T002 CLI OAuth login command integration
- [ ] T003 API key + base_url config validator
- [ ] T004 Desktop auth settings view
- [ ] T005 Tauri auth/config bridge command wiring
- [ ] T006 Remote project workspace E2E test
- [ ] T007 Remote reconnect and session continuity E2E test
- [ ] T008 Client auth + session continue E2E test
- [ ] T009 Client serve control + auth integration test
- [ ] T010 CI workflow for remote/client test suites

Keep this checklist synced with `status`:
- `status: done` => `[x]`
- others => `[ ]`

- id: T001
  title: OAuth login orchestrator module
  scope: Add a reusable OAuth login orchestration helper for codex/claude/gemini account onboarding.
  status: todo
  owner: 
  claimed_at: 
  done_at: 
  priority: P0
  depends_on: []
  branch: feat/wesr001-m6-t001
  pr_or_commit: 
  blocker: 
  acceptance:
  - Supports provider-specific OAuth login flow selection.
  - Emits machine-readable success/failure result schema.
  files:
  - lib/auth/oauth-login.js

- id: T002
  title: CLI OAuth login command integration
  scope: Integrate OAuth orchestrator into `aih <cli> add/login` flow and preserve backward-compatible UX.
  status: todo
  owner: 
  claimed_at: 
  done_at: 
  priority: P0
  depends_on: [T001]
  branch: feat/aresr002-m6-t002
  pr_or_commit: 
  blocker: 
  deliverable: CLI entry integration for OAuth login selection and execution.
  acceptance:
  - `aih codex|claude|gemini add` can run OAuth onboarding path.
  - Existing non-OAuth login paths remain available.
  files:
  - bin/ai-home.js

- id: T003
  title: API key + base_url config validator
  scope: Add central schema validator for api_key/base_url persistence and normalization.
  status: todo
  owner: 
  claimed_at: 
  done_at: 
  branch: feat/aresr003-m6-t003
  pr_or_commit: 
  blocker: 
  acceptance:
  - Invalid combinations fail with clear error codes.
  - Valid values persist in normalized format.
  files:
  - lib/profile/credential-config.js

- id: T004
  title: Desktop auth settings view
  scope: Add a dedicated desktop UI view for OAuth login and API key/base_url configuration.
  status: todo
  owner: 
  claimed_at: 
  done_at: 
  priority: P0
  depends_on: [T002, T003]
  branch: feat/aresr004-m6-t004
  pr_or_commit: 
  blocker: 
  acceptance:
  - User can trigger OAuth login from UI.
  - User can save api_key/base_url with inline validation feedback.
  files:
  - desktop/tauri/src/views/auth-settings.tsx

- id: T005
  title: Tauri auth/config bridge command wiring
  scope: Add backend command bridge for desktop auth config operations and OAuth trigger.
  status: todo
  owner: 
  claimed_at: 
  done_at: 
  priority: P0
  depends_on: [T002, T003]
  branch: feat/aresr005-m6-t005
  pr_or_commit: 
  blocker: 
  acceptance:
  - Frontend can call stable command contract for auth settings.
  - Errors are returned as structured payloads.
  files:
  - desktop/tauri/src-tauri/src/commands/auth.rs

- id: T006
  title: Remote project workspace E2E test
  scope: Add E2E test for remote project bind/run/file mutation lifecycle on workspace target.
  status: todo
  owner: 
  claimed_at: 
  done_at: 
  depends_on: []
  branch: feat/wesr006-m6-t006
  pr_or_commit: 
  deliverable: Deterministic E2E test for remote project workspace operations.
  acceptance:
  - Covers bind, run command, write/read file, patch return assertions.
  - Produces stable pass/fail in local CI run.
  files:
  - test/remote.project.workspace.e2e.test.js

- id: T007
  title: Remote reconnect and session continuity E2E test
  scope: Add E2E regression for remote disconnect/reconnect preserving session control continuity.
  status: todo
  owner: 
  claimed_at: 
  done_at: 
  priority: P0
  depends_on: [T006]
  branch: feat/wesr007-m6-t007
  pr_or_commit: 
  blocker: 
  acceptance:
  - Simulated disconnect triggers reconnect path.
  - Session context remains recoverable after reconnect.
  files:
  - test/remote.session.reconnect.e2e.test.js

- id: T008
  title: Client auth + session continue E2E test
  scope: Add client-side E2E test for auth flow entry and continue-chat session behavior.
  status: todo
  owner: 
  claimed_at: 
  done_at: 
  blocker: 
  acceptance:
  - Verifies auth view interactions and command invocation contracts.
  - Verifies continue-chat uses stable session_id handling.
  files:
  - test/client.auth-session.e2e.test.js

  pr_or_commit: 
  branch: feat/wesr008-m6-t008
- id: T009
  title: Client serve control + auth integration test
  scope: Add integration test for combined serve control and auth config behavior in client command path.
  status: todo
  owner: 
  claimed_at: 
  done_at: 
  priority: P0
  depends_on: [T005]
  branch: feat/aresr009-m6-t009
  pr_or_commit: 
  blocker: 
  acceptance:
  - Port/api_key/base_url changes remain consistent after restart.
  - Regression assertions cover invalid config rollback behavior.
  files:
  - test/client.serve-auth.integration.test.js

- id: T010
  title: CI workflow for remote/client test suites
  scope: Add CI workflow for running remote and client auth/session test suites with deterministic matrix.
  status: todo
  owner: 
  claimed_at: 
  done_at: 
  priority: P1
  depends_on: [T006, T007, T008, T009]
  branch: feat/aresr010-m6-t010
  pr_or_commit: 
  blocker: 
  acceptance:
  - Workflow runs target test files and reports failures clearly.
  - Can be executed in PR validation path.
  files:
  - .github/workflows/remote-client-test.yml

## Activity Log
- 2026-03-03T04:17:29.652Z [operator] Global reset: reinitialized all tasks to todo for fresh planning cycle (manual mode, no exec-plan session bindings).
