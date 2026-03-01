# Skill: Project Plan Coordinator

Use this skill when coordinating multiple AIs working in parallel on this repository.

## Purpose
- Create and maintain `plans/*.plan.md` as the single execution source.
- Prevent duplicate work by strict claim/lock process.
- Keep todo status transitions auditable.

## Scope
- Project-level only (current repository).
- Do not manage external repos.

## Inputs
- Current active plan file under `plans/`.
- Current repository state (`git status`, relevant files).

## Required Workflow
1. Select active plan file (`plans/<topic>-<date>.plan.md`). If none exists, create from `plans/_template.plan.md`.
2. Break work into atomic tasks with non-overlapping file scopes.
3. Assign each task one unique `id`.
4. Before any coding by any AI, update task to:
- `status: doing`
- `owner: <ai-name>`
- `claimed_at: <ISO8601>`
- `branch: <branch>`
5. Enforce no-overlap rule:
- If another task is `doing` and file scopes overlap, block new claim.
6. On completion:
- `status: done`
- `done_at: <ISO8601>`
- `pr_or_commit: <hash|PR>`
7. On blocker:
- `status: blocked`
- `blocker: <reason>`
8. Update `updated_at` and append one line in `Activity Log` for each status transition.

## Todo Format (Mandatory)
Each task item must include:
- `id`
- `title`
- `scope`
- `status`
- `owner`
- `claimed_at`
- `done_at`
- `priority`
- `depends_on`
- `branch`
- `pr_or_commit`
- `blocker`
- `deliverable`
- `acceptance`
- `files`

## Status Machine
- `todo -> doing -> done`
- `todo -> doing -> blocked -> doing -> done`
- Direct `todo -> done` is not allowed.

## Conflict Policy
- Never reassign a `doing` task unless coordinator explicitly marks takeover in `Activity Log`.
- Never edit another AI's claimed scope while task is `doing`.

## Coordinator Output Requirements
When producing or updating a plan:
- Keep Markdown readable and deterministic.
- Use ISO8601 UTC timestamps.
- Keep tasks actionable and file-scoped.
- Prefer 4-10 concurrent tasks depending on complexity.

## Quick Commands (recommended)
- `git status --short`
- `rg -n "status: (todo|doing|blocked|done)" plans/*.plan.md`

