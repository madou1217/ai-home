# Remote Project Quickstart

本文档用于 5-10 分钟内完成 `aih` 远程项目执行链路的最小可用验证：
- 绑定远程控制面与本地 CLI
- 建立可恢复的 task/session 工作流
- 验证最基本的执行、查看与恢复操作

## 适用场景

- 新团队首次接入远程项目模式
- 新环境上线前的冒烟验证
- 排障时快速确认“控制面 + 会话恢复”是否可用

## 前置条件

1. 已安装并可执行 `aih`
2. 至少有一个可用账号（如 `codex`）
3. 远程相关服务处于可连接状态
4. 在项目根目录可正常访问 `plans/` 与 `docs/`

## Step 1: 基础健康检查

```bash
aih ls
aih codex sessions
```

期望结果：
- `aih ls` 可列出账号，且目标账号为 Active
- `aih codex sessions` 可正常返回会话列表（允许为空）

## Step 2: 启动一个任务绑定会话

```bash
aih codex auto exec --task-key m7-t002-sca02 "执行 remote project quickstart 冒烟验证"
```

说明：
- `--task-key` 用于绑定“计划任务 <-> 会话”，确保恢复时不会串线
- 首次运行后，CLI 会输出会话标识（session_id）并建立绑定

## Step 3: 验证绑定与恢复能力

```bash
aih codex plan-sessions
aih codex auto exec --task-key m7-t002-sca02 resume "继续执行并输出当前进度"
```

期望结果：
- `plan-sessions` 中可看到 `m7-t002-sca02` 对应的 session
- `resume` 可进入原会话上下文，不创建重复新会话

## Step 4: 验证远程项目常用工作流

```bash
# 示例：列出计划看板（进行中任务）
npm run plan:board

# 示例：查看所有任务状态
npm run plan:board -- --all
```

期望结果：
- 看板可稳定渲染，不因单个任务字段异常而崩溃
- 当前任务状态与计划文件中的 `status`、checklist 保持一致

## 常见问题

### 1) `VERSION_MISMATCH`

现象：握手失败并提示协议版本不匹配。  
处理：对齐 CLI 与 daemon 的协议版本后重试（参考 `docs/remote/protocol-compatibility-matrix.md`）。

### 2) `AUTH_FAILED`

现象：认证失败，无法建立远程会话。  
处理：校验账号登录态或 token，必要时重新登录后再试。

### 3) 任务恢复失败或绑定缺失

现象：`resume` 时找不到会话或进入了新会话。  
处理：
1. 执行 `aih codex plan-sessions` 确认映射
2. 使用精确 `--task-key` 重新发起一次 `auto exec`
3. 再次执行 `resume` 验证恢复链路

## 验收清单

- [ ] 能使用 `--task-key` 成功启动任务绑定会话
- [ ] 能在 `plan-sessions` 中看到正确映射
- [ ] 能使用 `resume` 回到原会话
- [ ] 能完成看板查看并确认状态一致性

完成以上步骤后，即可认为远程项目 quickstart 已具备可操作性与可恢复性。
