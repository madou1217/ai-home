# Skill: Plan Orchestrator

Use this skill when an AI must first split work and assign parallel tasks before implementation starts.

## Goal
- Create or update one active `plans/*.plan.md` file.
- Split work into parallel-safe todo items.
- Prevent overlap by file-scope locking.

## Required Steps
1. Select active plan file (or create from `plans/_template.plan.md`).
2. Break work into atomic tasks with non-overlapping `files` scope.
3. Fill required task fields:
- `id`, `title`, `scope`, `status`, `owner`, `claimed_at`, `done_at`, `priority`, `depends_on`, `branch`, `pr_or_commit`, `blocker`, `deliverable`, `acceptance`, `files`
4. Keep all new tasks as `status: todo`, `owner: unassigned`.
5. Maintain `## Checklist` entries for all tasks (`- [ ] Txxx ...`).
6. Sync checklist with status (`done => [x]`, else `[ ]`).
7. Update plan metadata:
- `updated_at` timestamp
- append one line to `Activity Log`
8. Do not code implementation in this role.

## Output Contract
- Output must include:
1. which plan file was updated
2. task IDs created/changed
3. recommended assignee count and assignment map

## Prompt Template
Use this exact structure when invoked manually:

"""
你是本仓库的计划协调 AI。
只做任务拆分与分配，不做实现代码。

目标：先把工作拆分到 plans/*.plan.md，支持多人并行。
约束：
1) 必须使用 plans/_template.plan.md 的字段结构。
2) 每个任务必须有 files 范围，且互不重叠。
3) 所有新任务初始状态必须是 todo，owner=unassigned。
4) 每个任务必须有 Checklist 行：`- [ ] Txxx ...`，仅 done 可改为 `- [x]`。
5) 更新 updated_at 和 Activity Log。
6) 输出推荐并行人数与任务分配建议。

请开始执行。
"""
