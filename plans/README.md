# Plans Workspace Rules

This folder is the single source of truth for parallel task execution.

## Goal
- Allow multiple AIs to work in parallel without touching the same task.
- Keep every task in one `.plan.md` file with claim/owner/status fields.
- Every task must also appear as Markdown checklist item (`- [ ]` / `- [x]`).
- Use independent task sessions for parallel workers (`task-key -> session_id`).

## File Naming
- Active plan: `plans/active/<topic>-<yyyy-mm-dd>.plan.md`
- Archive plan: `plans/archive/<yyyy-mm>/<topic>-<yyyy-mm-dd>.plan.md`
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
- add `pr_or_commit: <PR URL/number preferred, else commit/hash>`
 - set checklist item to `- [x]`
6. If blocked, change:
- `status: blocked`
- add `blocker: <reason>`
 - keep checklist item as `- [ ]`

## Conflict Rule
- Never work on a task with `status: doing` owned by another AI.
- Never modify another AI's task fields except by explicit coordinator reassignment.
- For one `.plan.md` file, each worker must use a unique `--task-key` to avoid session collisions.

## Branch & Review Rule (Mandatory)
- One task => one branch. Branch naming: `feat/<owner>-<plan>-<task-id>` (or `fix/...`).
- No direct merge to main from worker branch.
- Every completed task must go through `review` and PR merge.
- `pr_or_commit` should prefer PR URL/number; commit hash is fallback only.

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
1. Start/continue a task-bound session:
- `aih codex auto exec --task-key <plan>-<task-id>-<owner> "<short instruction>"`
2. Inspect current bindings and recover sessions:
- `aih codex plan-sessions`
- `aih codex last-session`
3. Precise resume:
- `aih codex auto exec --task-key <plan>-<task-id>-<owner> resume "继续执行"`
