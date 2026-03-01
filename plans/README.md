# Plans Workspace Rules

This folder is the single source of truth for parallel task execution.

## Goal
- Allow multiple AIs to work in parallel without touching the same task.
- Keep every task in one `.plan.md` file with claim/owner/status fields.
- Every task must also appear as Markdown checklist item (`- [ ]` / `- [x]`).
- Each active plan should bind to one codex session (`plan -> session_id`).

## File Naming
- Active plan: `plans/<topic>-<yyyy-mm-dd>.plan.md`
- Template: `plans/_template.plan.md`

## Locking Protocol (Mandatory)
1. Pick only tasks with `status: todo`.
2. Immediately change:
- `status: doing`
- `owner: <ai-name>`
- `claimed_at: <ISO8601>`
- `branch: <branch-name>`
3. Commit this claim change first.
4. Do implementation work.
5. On completion, change:
- `status: done`
- `done_at: <ISO8601>`
- add `pr_or_commit: <commit/hash>`
 - set checklist item to `- [x]`
6. If blocked, change:
- `status: blocked`
- add `blocker: <reason>`
 - keep checklist item as `- [ ]`

## Conflict Rule
- Never work on a task with `status: doing` owned by another AI.
- Never modify another AI's task fields except by explicit coordinator reassignment.

## Required Task Fields
Each todo item must include:
- `id`
- `title`
- `scope`
- `status` (`todo|doing|blocked|done`)
- `owner`
- `claimed_at`
- `done_at`
- `priority` (`P0|P1|P2`)
- `depends_on` (list)
- `deliverable`
- `acceptance`
- `files`

## Checklist Rule (Mandatory)
- Add a `## Checklist` section in each plan file.
- Each task must have one line: `- [ ] T001 <title>`.
- Only mark `[x]` when task status is `done`.

## Minimal Workflow (No Long Prompt Required)
1. Start/continue a plan-bound session:
- `aih codex auto exec --plan plans/<name>.plan.md "<short instruction>"`
2. Inspect current bindings and recover session:
- `aih codex plan-sessions`
- `aih codex last-session`
3. Precise resume:
- `aih codex auto exec resume <session_id> "继续执行"`
