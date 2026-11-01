# Neo 输入卡顿排查与修复

日期：2026-11-01。基线为已有 0.6.0 工作树（HEAD `2d11abe` 加此前未提交成果），没有回滚、提交或推送。既有滚动优化见 [浏览器交互性能记录](browser-interaction-performance.md)。

## 复现与根因

在安全的本地测试页中，输入框的 `input` 回调使用 `history.replaceState` 将搜索词同步到 URL。通过真实 BrowserPane 键盘事件，每 75ms 输入一个字符，连续输入 `abcdefghijklmnopqrst`。

原版只收到 `adgjmps`，即 20 个字符中的 7 个。单次最小复现中，第一字输入后约 9ms 出现“正在显示页面”，到约 169ms 才消失；43ms 时输入的第二字被直接丢弃。原生页面没有长任务。普通输入不更新 URL 时正常。

`BrowserPane` 的视口 effect 依赖 URL 和 loading，每次变化都清除已经校验的显示尺寸，再等待 120ms debounce。原生同文档导航也会短暂报告 loading。等待期间 `sendInput` 忽略输入。随后 `BrowserRuntime.resize(fitToWidth)` 即使尺寸与内容宽度均未变化，也会更新画面代次并停止、重启 screencast。固定节奏复现中代次从 6 增到 13。

## 修改

- `src/renderer/BrowserPane.tsx`：保留仍然匹配的显示尺寸，短暂 loading 结束后可立即恢复输入；校验记录增加文档画面代次与缩放模式。完整导航、缩放模式切换、实际表面尺寸变化，以及需要探测布局的宽页面继续等待校验和新画面。
- `src/main/browser.ts`：当目标尺寸与当前尺寸相同，先读取实际布局宽度；响应式内容没有横向溢出时直接返回，不重启捕获或改变画面代次。出现新溢出仍执行原有 fit 流程。
- 新增 `tests/neo-interaction-performance.e2e.ts` 和 `tests/browser-viewport-continuity.test.ts`。前者统计真实输入接收和嵌入图像对应标记的解码时间，后者验证 URL 更新不失效坐标，而新增横向溢出仍使旧坐标失效。

没有降低 JPEG quality 88、Retina DPR 2 或 2048px 捕获上限，没有关闭录制、元素选取、共享或 Neo 功能。

## 同条件测量

Electron 窗口 1440×900、独立空配置、本地 HTTP 页面、现有 BrowserOS neo。各性能脚本顺序执行，避免测试互相争抢资源。普通交互包含 30 / 1000 个条目的页面与录制开/关，每类共 32 次输入或点击；标签切换 10 次；宽页为 1100px、120 个条目，分别测未选中与选中页头。修复版宽页三轮六段，每段 5 秒。

| 指标 | 基线 | 修复版源码构建 |
| --- | ---: | ---: |
| URL 同步输入接收数 | 7 / 20 | 20 / 20 |
| URL 同步输入期间画面代次增加 | 7 次 | 0 次 |
| URL 同步输入像素响应 P95 | 丢字，不能作为完整延迟指标 | 31.0ms |
| 普通输入像素响应 P95 | 28.2ms | 30.0ms |
| 普通点击像素响应 P95 | 31.9ms | 31.4ms |
| 宽页滚动画面 fps | 56.5–56.6 | 56.5–56.8 |
| 宽页滚动帧间隔 P95 | 25.7–30.0ms | 25.7–32.7ms |
| 宽页停手后输入排空 | 37–58ms | 43–59ms |
| 标签切换完成 P95 | 205.1ms | 212.5ms |

窗口调整四个样本的完成时间：基线约 157–351ms、修复版约 163–459ms；测量包括显式 150ms 观察窗口与 Playwright 状态轮询，属于粗粒度完成时间，不能据此宣称窗口调整已加速。完整导航与缩放仍有必要的画面等待。

输入/点击时间以发出事件到对应 JPEG 中颜色标记实际完成解码为准，不用外层 RAF 代替画面响应。宽页测试还断言滚动距离完整。普通场景本来就比较流畅，本次确认修复的是 URL 同步输入丢字，没有证明所有主观卡顿均已消除。

## 验证与证据

```sh
npm run build
npm run typecheck
npm test

# URL 同步输入回归；没有该变量则测普通/长页面、录制、标签和窗口调整
ATHENA_PERF_URL_INPUT=1 node_modules/.bin/tsx tests/neo-interaction-performance.e2e.ts

WORKBENCH_BROWSEROS_TEST_BINARY="$PWD/../browseros-runtime/BrowserOS neo.app/Contents/MacOS/BrowserOS neo" \
  node_modules/.bin/tsx --test --test-concurrency=1 \
  tests/browser.test.ts tests/browser-input-queue.test.ts \
  tests/browser-viewport-continuity.test.ts tests/sharing-browser.test.ts

node_modules/.bin/tsx tests/browser-frame-presentation.e2e.ts
node_modules/.bin/tsx tests/viewport-fit.e2e.ts
```

- 单元套件 165 通过、14 按环境跳过；原生专项最终 36/36 通过。
- 延迟图片/过期解码/错误比例三个断言通过；真实宽页、窄高窗口、选区坐标、滚动、100%/fit、标签导航六项 UI 验收通过。
- 首次原生套件有一次旧 fit-width 用例等待高页面帧超时；交接中此前已有同类记录。本次未改该用例、阈值或断言，保存的原版与修复版定向测试均通过，随后完整原生套件通过。后续有限诊断在原版再次捕获两次失败，确认存在缩放补帧截图与 screencast 的竞争；随后已完成 [捕获恢复修复](neo-capture-recovery.md)，诊断原始证据见 [帧超时记录](neo-frame-timeout-diagnosis.md)。
- 开发过程中宽页导航后的提前放行、切换缩放模式时的旧解码放行，都被原有回归捕获并修正；最终原断言通过。

本机原始结果在 `test-results/neo-performance/`（被 Git 忽略）：`before-url-burst.json` 是保存的原构建失败数据，`final-url-burst.json`、`final-interactions.json`、`final-wide-scroll.json` 是源码构建最终对比，`unit.log`、`native-final.log`、`frame-presentation-final.log`、`viewport-fit.log` 为检查记录。初始源码与原构建保存在 `.runtime/neo-performance-baseline/`，便于复查；没有覆盖原来的预览应用。

独立预览包为 `release/neo-performance/mac-arm64/Athena.app`，版本号仍为 0.6.0，ad-hoc 深度签名验证通过，未公证。对实际打包程序再次使用隔离数据目录验收：URL 同步输入 20/20，像素响应 P95 30.3ms；普通输入 P95 42.5ms、点击 30.2ms、标签切换 208.6ms；宽页未选中/已选中分别 55.6/55.2fps，滚动距离完整。证据为 `packaged-url-burst.json`、`packaged-interactions.json`、`packaged-wide-scroll.json` 与 `codesign.log`。用户当前运行中的旧应用未替换，测试实例均已退出。

上述段落记录输入修复首版的验收。该预览路径随后已更新为同时含捕获恢复的版本；最新打包验收为输入 20/20、P95 31.7ms、宽页约 56.7fps，详见 [捕获修复报告](neo-capture-recovery.md)。

未验证用户具体站点、真实账号业务、重视频/Canvas/WebGL 页面、后台大量 Agent 输出同时发生的负载。缩放后的宽页面在 URL 变化时仍可能需要布局探测，本次快速路径只用于实际无需重新调整的视口。没有实施桌面 Computer Use。
