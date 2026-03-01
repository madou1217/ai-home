# Plans Workspace Rules

This folder is the single source of truth for parallel task execution.

## Goal
- Allow multiple AIs to work in parallel without touching the same task.
- Keep every task in one `.plan.md` file with claim/owner/status fields.

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
6. If blocked, change:
- `status: blocked`
- add `blocker: <reason>`

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

