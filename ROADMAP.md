# 🗺️ ai-home 演进路线图 (Roadmap)

`ai-home` 的最终愿景是成为一个**全平台、分布式的 AI 智能体工作台 (AI Agent Workspace OS)**。
它将从一个本地的 CLI 劫持脚本，进化为一个带 GUI、支持端端加密同步、并能漫游到移动端和云端的终极黑客工具。

---

## 🚩 Milestone 1: CLI 终极闭环与资产安全 (当前阶段)
**目标**：让命令行工具本身做到完美无瑕，彻底接管原生命令，并保障用户的 API Key 和 Token 资产安全。

*   [x] **原生命令接管 (True Global Default)**
    *   当执行 `aih <cli> set-default <id>` 时，不仅是 `aih` 内部默认，更是要**劫持原生系统**。
    *   机制：自动备份宿主机的真实 `~/.codex` 为 `~/.codex.bak`，然后创建一个**软链接 (Symlink)** 指向指定的沙箱。这样你甚至不需要输入 `aih`，直接输入 `codex` 也能完美使用我们配置好的主账号。
*   [x] **加密资产导出与导入 (Secure Sync)**
    *   命令：`aih export my_sandbox.aes` / `aih import my_sandbox.aes`
    *   机制：支持两种安全路径：`AES-256-GCM`（密码模式）与 `age + SSH key`（公钥模式，支持 `ssh-ed25519` / `ssh-rsa`）。将 `~/.ai_home/profiles`（包含 Token、API Keys 和环境变量）打包加密，实现多机无缝安全漫游。

## 🚩 Milestone 2: 桌面端 GUI (Rust + Tauri)
**目标**：为不习惯命令行的用户提供一个极客风格的桌面控制台，采用最极致性能的架构。

*   **技术栈**：Rust (后端引擎) + Tauri (极轻量级桌面框架) + React/Vue (前端 UI)。
*   **核心功能**：
    *   **沙箱看板**：可视化管理所有工具的沙箱，显示邮箱、API Key 缩略图、Rate Limit 冷却倒计时。
    *   **一键启动与切换**：点击按钮即可在内置终端中唤起对应账号。
    *   **本地 PTY 引擎重写**：将现有的 Node.js `node-pty` 替换为纯 Rust 实现的伪终端监控，性能更高，内存占用不到 10MB。

## 🚩 Milestone 3: 分布式与远程沙箱 (Remote Workspace)
**目标**：打破本地算力和环境的限制，让 AI Agent 运行在远端。

*   **痛点**：有时候我们在本地笔记本上，但需要 AI 去操作公司内网的服务器或高配算力工作站上的代码。
*   **核心功能**：
    *   **ai-home Daemon**：在远程 Linux 服务器上运行 `ai-home` 守护进程。
    *   **RPC 协议转发**：本地 GUI 或 CLI 通过 gRPC/WebSocket 连接到远程服务器，所有的指令输入在本地，但实际的 PTY 执行、文件修改全部发生在远程机器上。

## 🚩 Milestone 4: 移动端指挥中心 (Mobile Agent Console)
**目标**：在手机上随时随地指挥你的代码 Agent。

*   **痛点**：在通勤路上，突然有个灵感，想要让 Claude Code 帮你写个脚本并运行测试，但手机上没有完整的开发环境。
*   **核心功能**：
    *   **移动端 App** (React Native / Flutter，或 Tauri Mobile)。
    *   不需要在手机上安装 Node.js 或 Python 环境，App 纯粹作为一个**远程控制终端**。
    *   连接到 Milestone 3 部署的远程沙箱，提供一个针对手机屏幕优化的“聊天流”界面（屏蔽掉复杂的终端滚动），你在手机上打字，云端的 Codex/Claude 为你写代码并返回结果。

---

*“We are not just managing CLIs, we are building a hypervisor for AI Agents.”*
