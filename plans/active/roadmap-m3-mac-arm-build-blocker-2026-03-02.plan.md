# Plan: m3-mac-arm-build-blocker

- plan_id: m3-mac-arm-build-blocker-2026-03-02
- coordinator: codex
- created_at: 2026-03-02T01:13:49+08:00
- updated_at: 2026-03-02T01:30:58+08:00
- status: active

## Global Rules
- Single source of truth: this file only.
- Claim before coding.
- One AI can hold multiple tasks only if scopes do not overlap.

## TodoList
- [ ] Restore desktop mac arm packaging path to buildable state.
- [ ] Keep changes scoped and reviewable via separated PR chain.

## Checklist
- [ ] T001 Build blocker root-cause and recovery spec
- [ ] T002 Reconstruct missing Tauri project scaffolding files
- [ ] T003 Restore desktop frontend build scaffold and dist generation
- [ ] T004 Build pipeline validation for macOS arm64 output

Keep this checklist synced with `status`:
- `status: done` => `[x]`
- others => `[ ]`

- id: T001
  title: Build blocker root-cause and recovery spec
  scope: Identify why desktop/tauri/src-tauri cannot build and define exact recovery steps.
  status: todo
  owner: 
  claimed_at: 
  done_at: 
  priority: P1
  depends_on: []
  branch: feat/m3-mac-arm-build-blocker
  pr_or_commit: 
  blocker: 
  acceptance:
  - Root cause is documented with concrete missing files and expected structure.
  - Recovery path lists exact commands and required artifacts for mac arm packaging.
  files:
  - docs/release/desktop-platform-checklist.md
  - docs/release/desktop-rollback-runbook.md

- id: T002
  title: Reconstruct missing Tauri project scaffolding files
  scope: Restore Rust/Tauri manifest and config files required to build desktop app.
  status: todo
  owner: 
  claimed_at: 
  done_at: 
  priority: P1
  depends_on: [T001]
  branch: feat/m3-mac-arm-build-blocker
  pr_or_commit: 
  blocker: 
  acceptance:
  - `desktop/tauri/src-tauri/Cargo.toml` exists and references current command modules.
  - `desktop/tauri/src-tauri/build.rs` and minimal cargo metadata are valid for tauri build.
  files:
  - desktop/tauri/src-tauri/Cargo.toml
  - desktop/tauri/src-tauri/build.rs

- id: T003
  title: Restore desktop frontend build scaffold and dist generation
  scope: Add missing frontend project files so `../dist` can be produced for tauri packaging.
  status: todo
  owner: 
  claimed_at: 
  done_at: 
  priority: P1
  depends_on: [T002]
  branch: feat/m3-mac-arm-build-blocker
  pr_or_commit: 
  blocker: 
  acceptance:
  - `desktop/tauri` includes minimal package/toolchain files and installs cleanly.
  - `npm run build` under `desktop/tauri` produces `dist/index.html`.
  files:
  - desktop/tauri/package.json
  - desktop/tauri/index.html
  - desktop/tauri/tsconfig.json
  - desktop/tauri/tsconfig.node.json
  - desktop/tauri/vite.config.ts
  - desktop/tauri/src/main.tsx

- id: T004
  title: Build pipeline validation for macOS arm64 output
  scope: Add/adjust local and CI packaging checks for .app/.dmg on mac arm.
  status: todo
  owner: 
  claimed_at: 
  done_at: 
  priority: P1
  depends_on: [T003]
  branch: feat/m3-mac-arm-build-blocker
  pr_or_commit: 
  blocker: 
  acceptance:
  - Local command can produce macOS arm installable output.
  - CI preflight checks fail fast when tauri scaffolding is incomplete.
  files:
  - .github/workflows/desktop-release.yml
  - desktop/tauri/package.json
  - desktop/tauri/src-tauri/tauri.conf.json
  - desktop/tauri/src-tauri/icons/icon.png
  - desktop/tauri/src-tauri/icons/128x128.png
  - desktop/tauri/src-tauri/icons/128x128@2x.png
  - desktop/tauri/src-tauri/icons/32x32.png
  - desktop/tauri/src-tauri/icons/icon.icns
  - desktop/tauri/src-tauri/icons/icon.ico
  - package.json

## Activity Log
- 2026-03-03T04:17:29.652Z [operator] Global reset: reinitialized all tasks to todo for fresh planning cycle (manual mode, no exec-plan session bindings).
