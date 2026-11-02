# Athena

Athena 是运行在 Mac 上的本地 AI 工作台：用 Codex 处理真实项目，在同一窗口浏览网页、调整页面元素，并核对任务结果。

- **本机任务**：复用已登录的 Codex CLI，展示计划、工具动作、审批、结果与产物。
- **首次准备**：用连续对话完成 Codex 检测、安装与登录、工作目录确认，以及可选的网页工具准备。
- **网页工作区**：BrowserOS neo 多标签浏览、元素选取、可撤销预览与操作录制。
- **页面协作**：邀请他人查看当前网页，分别管理操作权限与控制权。
- **模型与用量**：读取 CLI 支持的模型，汇总真实 Token 与 USD API 等价估算。

![Athena 实际应用工作区](docs/screenshots/workspace.png)

## 下载

**最新版本：[0.7.0](https://github.com/Dylan-Nihilo/athena/releases/tag/v0.7.0)。**

| 平台                  | 安装包                                                                                                         |
| --------------------- | -------------------------------------------------------------------------------------------------------------- |
| macOS · Apple Silicon | [Athena 0.7.0 DMG](https://github.com/Dylan-Nihilo/athena/releases/download/v0.7.0/Athena-0.7.0-mac-arm64.dmg) |
| macOS · Apple Silicon | [Athena 0.7.0 ZIP](https://github.com/Dylan-Nihilo/athena/releases/download/v0.7.0/Athena-0.7.0-mac-arm64.zip) |

[SHA-256 校验文件](https://github.com/Dylan-Nihilo/athena/releases/download/v0.7.0/SHA256SUMS.txt) · [全部版本](https://github.com/Dylan-Nihilo/athena/releases)

当前项目采用 ad-hoc 签名，尚未配置 Developer ID 分发签名、公证或自动更新。安装包不包含你的 Codex 登录或 BrowserOS neo；首次引导可按需准备运行组件。

版本变化见 [CHANGELOG](CHANGELOG.md)。安装和使用细节见 [用户指南](docs/user-guide.md)。

## 运行前提

1. **macOS Apple Silicon**：当前安装包的分发目标。
2. **Codex CLI**：首次引导会检测已有安装与登录；缺少时展示官方来源和安装位置，再由你确认准备。
3. **BrowserOS neo（网页功能需要）**：引导可复用已有安装或准备运行组件，也可以稍后设置；普通 Chrome 不能替代它。

Codex 安装与登录参见 [官方说明](https://github.com/openai/codex#quickstart)。Athena 复用 CLI 登录，模型请求使用对应账户的配额或计费。

已有用户直接进入工作台，可从「设置与连接」重开引导。选择、检测和结果会留在引导对话中；取消或回看不会自动重放安装与登录。

BrowserOS neo 使用独立 profile，在后台运行；网页画面与输入位于 Athena 窗口内。源码开发时可用下方脚本安装项目固定版本。

当前任务执行器只接通 **Codex**。其他 CLI 的安装检测不代表已接入执行；桌面 Computer Use 仍处调研阶段。详见 [能力边界](docs/user-guide.md#能力与验证边界)。

## 从源码开发

需要 Node.js **22.12+**、npm、已登录的 Codex，以及有效的 HeroUI Pro 构建授权。

在仓库根目录运行：

```bash
npm ci
npm run setup:browseros
npm run dev
```

`npm ci` 会执行 `heroui:setup`，优先恢复完整的本机授权缓存。新环境需私下配置 `HEROUI_KEY`；不要把密钥或 Pro 构件提交到仓库。详见 [开发环境](docs/user-guide.md#开发环境与验证)。

`setup:browseros` 下载并校验官方固定版本，默认放到相邻的 `../browseros-runtime/`，不启动浏览器或覆盖系统安装。

常用检查与本机构建：

```bash
npm run typecheck
npm test
npm run build
npm start
npm run package
```

`package` 构建本机应用目录，默认输出到 `release/`。模型实测、共享联调和分发验证的范围见 [用户指南](docs/user-guide.md#开发环境与验证)。

前端修改先读 [DESIGN.md](DESIGN.md)；工程约定见 [AGENTS.md](AGENTS.md)。依赖版本以 [package.json](package.json) 与锁文件为准。

## 文档导航

| 文档                                              | 内容                                           |
| ------------------------------------------------- | ---------------------------------------------- |
| [用户指南](docs/user-guide.md)                    | 初次配置、任务、网页预览、共享、数据与常见问题 |
| [设计约定](DESIGN.md)                             | 视觉方向、HeroUI 组件映射、状态与交互          |
| [Agent 交互与用量](docs/agent-experience.md)      | 模型执行证据、Token 口径与缺失数据             |
| [共享工作区页面](docs/shared-workspace.md)        | 网络条件、参与者权限与控制权                   |
| [飞书连接指南](docs/feishu-setup.md)              | 机器人创建、配对与连接恢复                     |
| [Computer Use 交接](docs/computer-use-handoff.md) | 已实现的网页能力与桌面调研边界                 |
| [第三方声明](THIRD_PARTY_NOTICES.md)              | 运行时、图标、组件来源与许可                   |

## 数据与许可

沿用 `app.agent.workbench` 与 `~/Library/Application Support/Agent Workbench/`，保留已有数据、钥匙串和工具协议标识。迁移与凭据范围见 [数据与凭据](docs/user-guide.md#数据与凭据)。

本仓库公开可见，项目代码保持 **UNLICENSED**，尚未授予开源许可证。HeroUI Pro 是商业授权组件；其包、源码和授权密钥不作为本项目的公开源码分发。

真实模型调用、网站兼容性和外部飞书联调均有各自的验证范围；应用截图与设计稿不能替代运行证据。
