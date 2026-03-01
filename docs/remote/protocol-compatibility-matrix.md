# Remote Protocol Compatibility Matrix

本文档定义 `aih` 本地 CLI（`lib/remote/connector.js`）与 remote daemon（`remote/daemon/src/main.rs`）之间的协议兼容关系、失败回退行为与升级建议。

## Version Source of Truth

- CLI 默认协议版本：`v1`
  - 代码位置：`lib/remote/connector.js` 中 `DEFAULTS.protocolVersion = 'v1'`
- Daemon 服务端协议版本：`v1`
  - 代码位置：`remote/daemon/src/main.rs` 中 `SERVER_PROTOCOL_VERSION = "v1"`
- Wire contract 演进规则：`remote/proto/control.proto`
  - 新字段必须追加编号；不复用已发布字段编号；新增 RPC 仅允许增量。

## CLI <-> Daemon Compatibility Matrix

| CLI protocolVersion | Daemon protocolVersion | 结果 | 握手返回 | 客户端行为 | 运维结论 |
| --- | --- | --- | --- | --- | --- |
| `v1` | `v1` | Supported | `SERVER_HELLO v1 ...` + `HELLO_ACK ... v1` | 继续 `AUTH`，进入 `ready`，启用 heartbeat/reconnect | 生产可用 |
| `v1` | 非 `v1` | Unsupported | `ERR VERSION_MISMATCH expected v1` 或 preamble 版本不一致 | 抛出 `VERSION_MISMATCH`，标记为 non-retryable，连接关闭 | 必须升级/降级到同一协议版本 |
| 非 `v1` | `v1` | Unsupported | `ERR VERSION_MISMATCH expected v1` | 抛出 `VERSION_MISMATCH`，标记为 non-retryable，连接关闭 | 必须升级/降级到同一协议版本 |

说明：当前主干实现仅声明并支持 `v1`，因此除 `v1 <-> v1` 外均视为不兼容。

## Failure and Fallback Behavior

### 1) 协议不匹配（`VERSION_MISMATCH`）

- 触发点：
  - Daemon 在 `HELLO` 阶段校验失败并返回 `ERR VERSION_MISMATCH expected v1`。
  - CLI 在读取 `SERVER_HELLO` preamble 时检测到版本不一致并主动抛错。
- 回退策略：
  - CLI 将 `VERSION_MISMATCH` 归类为 `NON_RETRYABLE_RECONNECT_CODES`。
  - 不进入无限重连，直接转为 `closed/non_retryable_failure`。

### 2) 认证失败（`AUTH_FAILED`）

- 回退策略与 `VERSION_MISMATCH` 一致：non-retryable，直接关闭连接。
- 运维动作：先修复 token/认证配置，再重连。

### 3) 连接中断（网络抖动、socket close）

- 若错误非 non-retryable：按指数退避重连。
- 默认参数：`maxAttempts=12`、`baseDelayMs=400`、`maxDelayMs=8000`、带抖动。
- 成功重连后会尝试恢复已跟踪 remote session（`RESUME_SESSION`）。

## Upgrade Guidance

### 原则

- 始终保持 CLI 与 daemon 协议主版本一致。
- 先做灰度验证，再进行全量升级。
- 发生 `VERSION_MISMATCH` 时，不要依赖自动重连兜底。

### 推荐顺序（当前仅 `v1`）

1. 在灰度环境启动目标 daemon，确认其协议版本。
2. 使用同协议版本的 CLI 连通并执行 `HELLO/AUTH/PING` 基线检查。
3. 放量升级 daemon 与 CLI；保持两端版本对齐。
4. 监控 `VERSION_MISMATCH`、`AUTH_FAILED`、`SOCKET_CLOSED` 错误码占比。

### 回滚策略

- 若升级后出现协议不匹配，回滚任一端到对齐版本（本仓库即 `v1` 对齐）。
- 回滚后重新建立连接，不依赖旧连接自动恢复。

## Operator Quick Checks

- 代码常量检查：
  - `lib/remote/connector.js` 的 `DEFAULTS.protocolVersion`
  - `remote/daemon/src/main.rs` 的 `SERVER_PROTOCOL_VERSION`
- 现网症状：
  - 日志出现 `ERR VERSION_MISMATCH expected v1`
  - CLI 状态进入 `closed` 且原因为 `non_retryable_failure`

