# Skill: AIH Task Orchestrator

Use this skill when you need one coordinator AI to split work and dispatch subagents with `aih`.

## Goal
- Keep `plans/*.plan.md` as single execution source.
- Produce runnable `aih` commands for each subagent.
- Ensure every task has owner/status so progress is visible.
- Bind each plan to one codex session for deterministic resume.

## Required Workflow
1. Select an active plan file in `plans/`.
2. Split work into atomic tasks with non-overlapping `files` scope.
3. Create/update tasks with mandatory fields from `plans/_template.plan.md`.
4. Keep new tasks in `status: todo`, `owner: unassigned`.
5. Keep `## Checklist` synced for every task (`done => [x]`, else `[ ]`).
6. For each task, generate one dispatch command:
- `aih codex auto exec --plan <plans/xxx.plan.md> "<worker-instruction>"`
7. Update `updated_at` and append one line to `Activity Log`.

## Dispatch Prompt Contract
Worker instruction must include:
- one target plan path (must match `--plan`)
- one target task id
- claim-first rule (`todo -> doing` before coding)
- scope limit (`files` only)
- finish rule (`doing -> done` with `pr_or_commit`)

## Visibility Rule
- Do not maintain separate private state.
- All status must be written to `plans/*.plan.md`.
- Use `npm run plan:board` to inspect who is doing what.
- Use `aih codex plan-sessions` to inspect `plan -> session_id` binding.

## Output Contract
Output must include:
1. plan file updated
2. task IDs created/updated
3. subagent dispatch command list (`aih ...`)
