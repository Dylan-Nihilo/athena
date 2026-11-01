# Neo 并发捕获恢复修复

2026-11-01。继续修复 [有限诊断](neo-frame-timeout-diagnosis.md) 确认的宽页等待画面问题，保留 [URL 输入修复](neo-input-performance.md) 和此前未提交成果。

## 行为和修改范围

缩放补帧截图与 screencast 并发时，Neo 曾把 `1100×1833` 的真实视口报告为 `615×1024`。旧实现发布该帧并推进序号，正确补帧因此被判定过时；静态页面会一直等到另一次重绘。

本轮产品代码只修改 `src/main/browser.ts`：

- 画面发布前校验原生 metadata 与 Athena 当前视口尺寸完全一致。异常帧仍 ACK，但不推进画面序号或已发布代次，所以不能挤掉正确补帧。
- 实际调整视口时暂不发布帧；调整结束后恢复流并安排一次 60ms 补帧检查。若已有正确帧，该检查直接结束。
- 同一标签的恢复定时器合并，持续出现错误帧也不会无限推迟恢复。截图、输入和视口操作仍复用原有串行队列，没有增加并行输入通道。
- 保留旧时间戳、文档代次、标签和序号校验。`finally` 清除调整状态，失败的 resize 不会把发布与输入队列永久锁住。

没有改协议标识、用户数据、画质、DPR、截图上限、录制、共享或 Agent 控制边界。前一轮 URL 同步输入的快速路径保留。

## 同条件验证

继续使用原来的 1100px 静态页面：从 `620×490` 的面板 fit 后，快速调整到 `390×650`，实际视口为 `1100×1833`。相同 Neo、独立 profile、相同 8 秒等待条件，六组交替比较保存的原版与修复版。

| 指标 | 原版 | 修复版 |
| --- | ---: | ---: |
| 本轮六次成功数 | 5/6 | 6/6 |
| 错误尺寸导致的超时 | 1 次，至少 8 秒 | 0 次 |
| 修复版遇到过渡尺寸帧 | — | 六次全部遇到 |
| 修复版正确帧到达时间 | — | 原生 resize 开始后 49–84ms |

前一轮诊断另有两次原版失败，原始日志仍保留。次数是有限诊断样本，不能用来估算长期失败率。此次六个修复样本都确实收到异常 raw frame，并随后发布正确尺寸的帧，证据不只是“没复现”。

`tests/browser-capture-race.test.ts` 在修复前稳定暴露错误帧覆盖补帧的问题；修复后七项确定性用例通过，覆盖正确新帧优先、文档/标签变化丢弃旧结果、过期时间戳、调整期间的帧、恢复不被延后、失败后队列释放。

同文件的真实 Neo 用例连续执行 **8 次缩放、16 次截图、8 次旧输入拒绝、8 次真实文本输入和 8 次点击**。截图与输入/resize 同时排队，逐次核对文本和计数器，发布尺寸与当前代次无不一致，没有死锁。执行时间约 2.1 秒（单独运行记录）。

完整单元套件 172 通过、15 环境跳过；真实 Neo 专项 44/44；原有延迟图片/旧解码/错误比例测试与六项页面缩放 UI 验收通过。没有放宽原用例阈值或断言。

## 复查入口

```sh
npm run build
npm run typecheck
node_modules/.bin/tsx --test tests/browser-capture-race.test.ts
WORKBENCH_BROWSEROS_TEST_BINARY="$PWD/../browseros-runtime/BrowserOS neo.app/Contents/MacOS/BrowserOS neo" \
  node_modules/.bin/tsx --test tests/browser-capture-race.test.ts
```

证据位于 `test-results/neo-performance/capture-fix/`：

- `unit-red.log`：修复前确定性失败；`unit-all.log`、`native-all.log`：最终套件。
- `comparison/runs.json`、`comparison/summary.json` 及 12 份轨迹：同条件六组对照。
- `concurrent-native.log`：真实并发操作；`frame-presentation.log`、`viewport-fit.log`：显示与坐标回归。
- `.runtime/fit-diagnosis/run-fix.py` 为有限对照的运行器，原基线和旧失败数据均保留。

这次修复覆盖已证实的尺寸元数据竞争和恢复路径；用户具体站点、重视频/Canvas/WebGL 与长时间负载未做全面验收。

## 更新后的独立预览

`release/neo-performance/mac-arm64/Athena.app` 已更新为同时包含输入优化与捕获恢复的构建，名称和版本仍是 Athena 0.6.0。ad-hoc 深度签名校验通过，未公证或发布。

实际打包程序、隔离 profile 的复测结果：URL 同步输入 20/20，像素响应 P95 31.7ms；普通输入 25.7ms、点击 30.3ms；宽页未选中/选中均约 56.7fps，帧间隔 P95 27.6/30.9ms，停手后排空 61/56ms，滚动距离完整。原有六项宽页、窄高视口、选区、滚动、100%/fit、标签导航 UI 断言也在打包程序通过。证据为本目录下的 `packaged-*.json/log` 与 `codesign.log`。

当前用户旧 `release/agent-experience/mac-arm64/Athena.app` 未被退出、替换或重启。要体验两个修复，需用户自行退出旧 Athena，再打开 `release/neo-performance/mac-arm64/Athena.app`；不要依靠相同的名称或版本号判断是否已更新。本轮没有提交、推送、安装新软件或改变权限。
