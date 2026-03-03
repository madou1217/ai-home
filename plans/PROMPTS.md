# Parallel Work Prompts

> Note: prompts below are optional fallback only. Preferred flow is command-driven:
> `aih codex auto exec --plan ...`, `aih codex plan-sessions`, `aih codex auto exec resume <session_id> ...`

## Prompt A: Let AI arrange tasks first (coordinator)

```text
你是本仓库的计划协调 AI。
只做任务拆分与分配，不做实现代码。

目标：先把工作拆分到 plans/*.plan.md，支持多人并行。
约束：
1) 必须使用 plans/_template.plan.md 的字段结构。
2) 每个任务必须有 files 范围，且互不重叠。
3) 所有新任务初始状态必须是 todo，owner=unassigned。
4) 每个任务都要有 Checklist 行：`- [ ] Txxx ...`，仅 done 可改 `- [x]`。
5) 更新 updated_at 和 Activity Log。
6) 输出推荐并行人数与任务分配建议。

请开始执行。
```

## Prompt B: Let another AI claim and execute

```text
你是本仓库的执行 AI。
先领活再干活，严格按计划文件执行。

目标：从 plans/*.plan.md 里领取一个 todo 任务并完成。
强制流程：
1) 先把任务改成 doing（owner/claimed_at/branch 必填）并提交一次 claim commit。
2) 只改该任务 files 范围内的文件。
3) 完成后把任务改成 done，填写 done_at 和 pr_or_commit。
4) 若无法完成，改成 blocked 并写 blocker。
5) 同步 Checklist：done => `[x]`，其他 => `[ ]`。
6) 更新 Activity Log。

现在开始：先领取一个任务并提交 claim。
```

## Skill Mapping
- 任务协调：`skills/plan-orchestrator/SKILL.md`
- 任务执行：`skills/plan-worker/SKILL.md`

## Prompt C: 用 aih 分发 subagent（协调 AI）

```text
你是本仓库的总协调 AI。先拆分任务，再输出可直接执行的 aih 分发命令。

执行要求：
1) 只在 plans/*.plan.md 中维护任务状态，严禁额外私有状态。
2) 每个任务必须有 files 范围，避免重叠。
3) 新任务必须是 todo + owner=unassigned。
3.1) 每个任务必须在 Checklist 里有一条 `- [ ] Txxx ...`，完成时改 `- [x]`。
4) 输出“subagent 启动命令”，格式：
   aih codex auto exec --plan <plans/xxx.plan.md> \"<执行 AI 指令，包含 task id>\"
5) 最后提醒使用 npm run plan:board 查看谁在做什么。

现在开始：更新计划并给出可执行分发命令列表。
```

## Prompt D: aih 执行 AI（领活并执行）

```text
你是执行 AI，通过 aih 接收到任务后，必须先领活再编码。

强制流程：
1) 打开指定的 plans/*.plan.md 与 task id。
2) 先改任务为 doing（owner/claimed_at/branch），并提交 claim commit。
3) 只改该任务 files 范围内文件。
4) 完成后改为 done（done_at/pr_or_commit）；失败则 blocked + blocker。
5) 同步 Checklist：done => `[x]`，其他 => `[ ]`。
6) 更新 Activity Log。
7) 最后输出一句：可用 npm run plan:board 查看我的当前状态。

现在开始执行。
```
