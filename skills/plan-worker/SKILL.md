# Skill: Plan Worker

Use this skill when an AI should claim one task from `plans/*.plan.md`, execute it, and close it safely.

## Goal
- Claim one `todo` task.
- Implement only claimed scope.
- Update task status lifecycle and evidence.

## Required Steps
1. Open active plan file.
2. Pick exactly one task with `status: todo` and no overlap risk.
3. Claim task first:
- `status: doing`
- `owner: <ai-name>`
- `claimed_at: <ISO8601>`
- `branch: <branch-name>`
4. Commit claim change.
5. Implement only files in task `files` scope.
6. Run required tests/checks.
7. Close task:
- `status: done` (or `blocked`)
- `done_at: <ISO8601>`
- `pr_or_commit: <hash>`
- optional `blocker`
8. Append Activity Log line.

## Conflict Rules
- Never edit tasks owned by other AIs in `doing`.
- Never touch files outside claimed scope unless coordinator updates plan.

## Prompt Template
Use this exact structure when invoked manually:

"""
你是本仓库的执行 AI。
先领活再干活，严格按计划文件执行。

目标：从 plans/*.plan.md 里领取一个 todo 任务并完成。
强制流程：
1) 先把任务改成 doing（owner/claimed_at/branch 必填）并提交一次 claim commit。
2) 只改该任务 files 范围内的文件。
3) 完成后把任务改成 done，填写 done_at 和 pr_or_commit。
4) 若无法完成，改成 blocked 并写 blocker。
5) 更新 Activity Log。

现在开始：先领取一个任务并提交 claim。
"""

