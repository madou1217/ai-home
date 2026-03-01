# 🛸 ai-home (终极 AI CLI 终端劫持与多开沙箱)

> *专为硬客玩家 (Geeks/Hackers) 打造的 AI 命令行多账号轮询与并发管家。*
> [English Documentation](README_en.md)

目前市面上大部分的 AI 终端工具（如 `Gemini CLI`、`Claude Code` 和 `Codex CLI`）都存在一个局限：它们在本地是**“单例单态”**的。官方的设定通常是你只用一个账号干活。
当你在聊天时遇到 `429 Rate Limit`（限流），你的心流就被打断了；当你想开两个窗口让两个 AI 同时处理两个不同的代码库，全局配置文件就会发生冲突，导致会话污染。

`ai-home` (`aih`) 是一个轻量级、极具极客精神的 C++ PTY（伪终端）劫持器和环境多路复用工具。

它通过巧妙的底层机制将原生的 CLI 压入物理隔离的沙箱中，让你能够使用不同的账号运行**无限并发实例**。最重要的是，它会在底层静默监听 AI 输出的字节流，一旦发现限流报错，就能实现**亚秒级的账号热切换 (Hot-Swap)**。

## 🔥 核心极客机制 (Core Hacks)

*   **零污染环境隔离 (Zero-Pollution Sandboxing)**: 运行时动态修改进程的环境树（如 `HOME`, `USERPROFILE`, 及其特定的隐藏文件夹）。`aih gemini 1` 和 `aih gemini 2` 在文件系统层面完全互不感知。
*   **深度 PTY 拦截 (Deep PTY Hijacking)**: 我们不仅是 `spawn` 进程，我们注入了 `node-pty` 层。我们在 AI 的回复渲染到你的终端之前，拦截并分析其原始字节流。
*   **毫秒级热切换 (Auto Hot-Swap)**: 如果 PTY 捕获到了 `429 Too Many Requests` 或 `Quota Exceeded` 等限流关键字，它会在后台瞬间接管当前的子进程，将该账号标记为 `[Exhausted]`（已耗尽），并**无缝为你启动下一个空闲账号**。*你的手甚至不需要离开键盘，聊天就能继续。*
*   **API Key 幽灵路由 (Phantom Routing)**: 如果你在终端里 `export OPENAI_API_KEY`，`ai-home` 会自动嗅探。它会将你的 Key 和 Base URL 生成哈希签名，自动为你创建一个专属的免登沙箱，并自动路由过去。
*   **无感迁移 (Ghost Migration)**: 自动嗅探你本机已有的 `~/.gemini` 或 `~/.codex` 全局登录状态，并在你第一次使用时无损克隆进 1 号沙箱，无需重新扫码登录。
*   **自动装备 (Auto-Install)**: 如果你没有安装对应的 CLI 工具，`ai-home` 会在运行时自动为你下载安装对应的 npm 全局包。

## 🚀 极速上手

强烈建议全局安装，并使用 `aih` 这个短命令。

### 1. 初始化与迁移
```bash
aih gemini
```
*如果你本机已经登录过 gemini（如果没有会自动帮你 npm install），它会提示你将其平滑迁移为你的 1 号主账号。*

### 2. 孵化更多分身 (网页授权模式)
```bash
aih gemini add
# 或者
aih codex add
```
*自动为你分配 ID 2、ID 3，并在独立沙箱中唤起原生的网页授权流程。*

### 3. API Key 注入模式 (支持第三方中转)
与其通过浏览器登录，你可以直接注入第三方（如 OpenRouter）的 API Key。
```bash
# 方式 A：交互式输入
aih claude add api_key

# 方式 B：自动识别环境变量 (极客推荐)
export OPENAI_BASE_URL="https://api.your-proxy.com/v1"
export OPENAI_API_KEY="sk-xxxx"
aih codex
```
*`ai-home` 会检测到环境变量，生成唯一哈希，并自动为你分配一个专属沙箱。如果你在新窗口重新 export 相同的配置，它会自动路由回这个沙箱，防止重复创建。*

### 4. 并发多线程工作
拆分你的终端界面。
窗口 A 执行：`aih gemini 1 "帮我重构这段代码"`
窗口 B 执行：`aih gemini 2 "帮我写刚才那段代码的单元测试"`
它们同时思考，互不干扰。

### 5. 自动弹匣 (Auto-Swapper)
当你预感到即将触碰账号的 Token 限制时，不要硬编码 ID。
```bash
aih gemini auto "帮我开发一个 React 应用"
```
*如果在对话中途，账号 1 突然被限流拦截，PTY 会接管报错，退出账号 1，并在 800毫秒内切到账号 2 重新接管终端。*

### 6. 资产侦察
```bash
aih ls
```
```text
📦 AI Home Accounts Overview

▶ gemini
  - Account ID: 1  [Active] [Exhausted Limit] (example@gmail.com) 
  - Account ID: 2  [Active] (work@company.com) 
```

### 7. 手动解禁误判账号
当某个账号被误标记为 `[Exhausted Limit]` 时，可手动清除标记：
```bash
aih codex unlock 4
# 或者 ID-first 风格
aih codex 4 unlock
```

### 8. 查看账号剩余额度快照（OAuth / Token）
`aih` 只使用可信接口刷新并缓存“剩余额度”（支持 Gemini / Codex / Claude）。
```bash
aih gemini usage 1
aih codex usage 2
aih claude usage 1
aih gemini usages
aih codex usages
aih claude usages
# 或者 ID-first 风格
aih gemini 1 usage
aih codex 2 usage
aih claude 1 usage
```
若提示无快照：
- `gemini`: 确认该账号已 OAuth 登录后重试
- `codex`: 确认该账号已 OAuth 登录（必要时在沙箱执行 `codex login`）后重试
- `claude`: 若提示本地 provider 未启动，请先启动对应 provider；或切换为 Claude OAuth 登录

### 9. 加密导出 / 导入（支持 age + SSH key）
```bash
# 导出（可选 selectors：codex:1,2 gemini）
aih export backup.aes

# 导入：默认同账号跳过
aih import backup.aes

# 导入：同账号强制覆盖
aih import -o backup.aes
```

说明：
- 密码模式：使用 `AES-256-GCM`
- SSH Key 模式：使用 `age`，仅列出本机 `~/.ssh/id_*.pub` 中可用的 `ssh-ed25519` / `ssh-rsa` 密钥
- 若系统未安装 `age`，CLI 会先给出平台安装命令，并支持交互式自动安装
- `-o` 未指定时，若目标账号已存在则跳过该账号；指定 `-o` 时覆盖该账号目录

### 10. 本地账号能力代理（OpenAI 兼容）
`aih` 现在内置本地代理，不依赖额外上游。默认后端为 `codex-local`，可按模型路由到 `codex/gemini`。

```bash
# 启动后台代理（默认 127.0.0.1:8317）
aih proxy

# 查看状态 / 重启 / 停止
aih proxy status
aih proxy restart
aih proxy stop
```

在客户端（例如 Cherry Studio）里填写：
- `base_url`: `http://127.0.0.1:8317/v1`
- `api_key`: `dummy`

高级可选：
```bash
# 前台调试运行
aih proxy serve --port 8317 --provider auto

# 开机自启（macOS launchd）
aih proxy autostart install
aih proxy autostart status
aih proxy autostart uninstall
```

管理接口：
- `GET /v0/management/status`
- `GET /v0/management/metrics`（成功率、超时率、最近错误）
- `GET /v0/management/accounts`
- `GET /v0/management/models`
- `POST /v0/management/reload`
