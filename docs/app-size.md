# 安装包体积优化

本文记录 issue #24 的无损体积优化、可复现测量方法和验收边界。基线与优化包均在 macOS arm64 上构建，使用 Electron 45.1.0、Athena 0.8.0 和 ad-hoc 签名；基线 commit 为 `a3559453828cf347c99d127ee9b2c41dd7b104da`。这些数据不是 Developer ID 签名或公证包的测量结果。

## 优化策略

1. `scripts/build-main.mjs` 将主进程实际使用的运行时依赖 bundling 到 `dist/main/main.cjs`，只外置 Electron；主进程和 preload 均压缩。主进程 source map 继续生成，便于本地诊断。
2. `package.json` 的分发规则排除 source map 和生产 `node_modules` 中的运行时代码，保留依赖的 LICENSE、LICENCE、NOTICE、COPYING 文本（含大小写、点号和连字符后缀变体）以及 `THIRD_PARTY_NOTICES.md`。
3. electron-builder 使用 `compression: "maximum"`，不更换有损资源，也不把随包功能改成额外下载。

renderer 仍保留完整构建产物，包括现有语法高亮语言和主题。Electron Framework、语言资源、SwiftShader、运行库、图标和图片质量均未裁减。

## 实测结果

字节数来自最终构建完成后的文件，不用开发模式或构建中间状态估算。

| 产物 | 基线 | 优化后 | 减少 | 降幅 |
| --- | ---: | ---: | ---: | ---: |
| `.app` | 417,678,760 B | 284,276,876 B | 133,401,884 B | **31.94%** |
| DMG | 150,601,160 B | 118,420,854 B | 32,180,306 B | **21.37%** |
| ZIP | 144,072,510 B | 123,395,477 B | 20,677,033 B | **14.35%** |
| `app.asar` 文件 | 153,220,032 B | 19,818,148 B | 133,401,884 B | **87.07%** |

ASAR 内部的主要变化：

| 分类 | 基线逻辑字节 | 优化后逻辑字节 |
| --- | ---: | ---: |
| 生产 `node_modules` | 126,949,385 B | 653,648 B |
| 其中非许可文件 | 126,373,723 B | 0 B |
| 其中许可文本 | 575,662 B | 653,648 B |
| `dist/main` | 1,245,879 B | 2,319,200 B |
| `dist/renderer` | 13,750,114 B | 13,750,114 B |
| `resources` | 2,909,376 B | 2,909,376 B |
| source map（跨目录叠加统计） | 44,219,873 B | 0 B |

主进程 bundle 因纳入飞书 SDK、QRCode、WebSocket 等实际运行时代码而增大；同时消除了这些依赖以及 renderer 已 bundle 依赖的重复分发。`sourcemaps` 是跨目录叠加视图，可能同时属于 `node_modules` 或 `dist/main`，不能与各行相加推导总体积。

优化后 Electron Framework 仍为 260,961,481 B，全部 Frameworks 仍为 262,618,308 B，与基线一致。这是 ZIP 降幅低于 ASAR 和 `.app` 的主要原因：应用代码去重不能显著压缩 Electron 自带且已经压缩的二进制和资源。本次以无损结果收尾，不通过删除 Electron 必需组件、语言资源或降低图片质量追逐原 ZIP 25% 目标。

## 测量与防回归

```bash
npm run build
npm run package

npm run size:app -- \
  --app release/v0.8.0/mac-arm64/Athena.app \
  --dmg release/v0.8.0/Athena-0.8.0-mac-arm64.dmg \
  --zip release/v0.8.0/Athena-0.8.0-mac-arm64.zip \
  --output /tmp/athena-optimized-size.json \
  --label optimized \
  --signature ad-hoc \
  --commit local-optimized \
  --assert-no-redundancy
```

报告分别记录 `.app` 文件逻辑字节、Frameworks、ASAR 文件、ASAR 内部分类、DMG 和 ZIP。已提交的干净源码可以省略 `--commit`；有未提交改动时必须显式传入源码 revision 或 dirty-tree 标识，避免把 dirty 构建误记成干净的 HEAD。`--assert-no-redundancy` 会在分发包重新出现非许可 `node_modules` 文件或 source map 时失败。`tests/app-size.test.ts` 使用真实 ASAR fixture 覆盖分类和断言，并检查许可 glob 变体及 dirty worktree 拒绝行为。

对比签名包时应重新构建基线和优化包，并传入 `--signature Developer-ID`；不能沿用这里的 ad-hoc 数字作为正式签名对照。

## 功能与性能验收

已通过的检查：

- `npm run typecheck`。
- `npm test`：251 项，235 通过、16 跳过、0 失败。
- 首页、交互控件、用量货币 UI 三个隔离 Electron 检查。
- 基线与优化 `.app` 均从没有项目 `node_modules` 的隔离目录启动；首页、设置和真实 BrowserOS 可用。
- 优化 DMG 实际挂载、复制安装后启动通过；优化 ZIP 实际解压后启动通过。
- 共享对照中，基线包已通过 LAN HTTPS/WSS、访客加入和页面编辑；优化包已通过 loopback HTTPS/WSS、访客加入、页面编辑并走到共享结束。完整脚本分别遇到加载状态时序和重复文本选择器问题，因此不能记作完整共享脚本全绿。
- 全新/升级脚本的基线与优化包均在“跳过浏览器后等待 Codex 连接”处得到相同的 `idle` 超时；两者在此之前均通过真实 Codex 检测、目录确认、真实 BrowserOS、草稿保留和重启检查。该失败不是优化包差异，但完整脚本同样不能记作全绿。
- 无其他重负载时交替运行三次的同脚本本机对照：启动中位数基线 1,587 ms、优化 808 ms；设置打开中位数基线 195 ms、优化 179 ms。样本很小，只代表本次环境，不构成其他机器上的性能保证。

尚未完成或需要单独验收：

- 真实 Codex 验收在授权的 3 条指令上限内未完整通过：前两条因持久化模型不支持当前 ChatGPT 账户而在执行前被拒绝；切换到 CLI 提供的模型后，第三条回合结束但未通过本地页面写入断言。停止和只读恢复未做真实模型验收；未发送外部消息，未出现提权审批。
- Developer ID、Hardened Runtime、正式签名、公证、stapler、Gatekeeper，以及 Release 上传和下载可用性。测量时本机没有可用代码签名身份。
- 真实飞书外部消息、桌面 Computer Use、敏感登录/验证码/支付不在本次体积改动验收范围内，未以本地模拟结果替代。
- 共享和 onboarding 完整脚本的上述既有失败需要在各自链路继续排查；不能用对照结果把它们宣称为通过。

## 回退与维护

新增主进程运行时依赖时，必须运行安装包 smoke，而不能只运行直接导入源码的测试。若依赖包含原生模块、按运行时定位的资源或无法 bundling 的动态加载，应先为该依赖增加明确的外置/解包规则和真实安装包测试，再调整“只保留许可文本”的分发规则；不要为追求体积静默删除功能。
