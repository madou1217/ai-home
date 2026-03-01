# Skill: AIH Task Worker

Use this skill when one subagent must claim a task and execute it end-to-end.

## Goal
- Claim exactly one task from `plans/*.plan.md`.
- Implement only claimed scope.
- Record status changes so coordinator can monitor progress.
- Continue on the same session bound to this plan when interrupted.

## Required Workflow
1. Open active plan file.
2. Pick one `status: todo` task.
3. Claim first (before code):
- `status: doing`
- `owner: <ai-name>`
- `claimed_at: <ISO8601>`
- `branch: <branch-name>`
4. Commit the claim update.
5. Implement only within `files` scope.
6. Run verification commands relevant to the task.
7. Close task:
- if done: `status: done`, `done_at`, `pr_or_commit`
- if blocked: `status: blocked`, `blocker`
8. Sync checklist line:
- if done: `- [x] Txxx ...`
- otherwise: `- [ ] Txxx ...`
9. Append Activity Log line.
10. Resume policy:
- Preferred command: `aih codex auto exec resume <session_id> "<continue prompt>"`
- If session_id is unknown: `aih codex last-session` or `aih codex plan-sessions <plan-file>`

## Hard Rules
- Never modify tasks owned by other AIs in `doing`.
- Never edit files outside claimed `files` scope unless coordinator updates plan.
- Never skip claim step.

## Visibility Rule
- Task status in plan file is the live source of truth.
- Coordinator reads `npm run plan:board` for board view.
- Plan/session relation is visible via `aih codex plan-sessions`.

## Self-check Before Exit
- Claim commit exists.
- Implementation commit exists (or blocker recorded).
- Plan file status reflects current state.
