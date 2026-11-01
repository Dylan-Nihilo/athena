# v7 面板像素捕获修复

2026-11-01。基线为 `release/logo-v7/mac-arm64/Athena.app`（Athena 0.6.0），修复包为 `release/logo-v7-capture-fix/mac-arm64/Athena.app`。保留 v7 Logo、原包和之前的未提交成果，没有提交、推送或替换安装目录。

## 修改

面板通过现有 resize IPC 上报宿主 `devicePixelRatio`，捕获两轴上限分别为面板 CSS 尺寸乘倍率，仍受 2048px 上限约束。fit 后的网页逻辑视口不再决定 JPEG 大小。持续流与静态补帧共用预算；质量 88、网页 DPR 2、三帧在途、滚轮合并和坐标协议保持原逻辑。Agent 的显式截图不受此预览预算影响。

同几何同预算的响应式页面仍走快速路径，不重启捕获或增加输入 epoch；倍率改变会重新捕获。面板监听 resolution 媒体查询变化，以处理跨屏时 CSS 尺寸不变的情况。此用法与 [MDN 的倍率变化监听示例](https://developer.mozilla.org/en-US/docs/Web/API/Window/devicePixelRatio#monitoring_screen_resolution_or_zoom_level_changes)一致。实际双屏拖动未测，测试覆盖模拟倍率变化、监听重新注册和后端捕获参数。

## 同条件实测

同一 Mac、1500×874 Electron 窗口、619×608 面板、宿主 DPR 2、1260px 宽本地页面、63 张图片与循环视频。独立 profile，各运行三轮短滑和持续滚动。通过真实 Electron 滚轮入口发送输入，按原生 `scrollOffsetY` 与捕获序号、解码后的宿主 RAF 匹配，重复位置的视频帧不计入滚动帧率。没有冻结其他进程，数值会随系统负载变化。

| 指标 | 原 v7 | 修复安装包 |
| --- | ---: | ---: |
| JPEG 像素 | 2048×2012 | 1238×1216 |
| 持续滚动位置更新/秒，三轮 | 27.1 / 21.0 / 27.0 | 56.6 / 58.2 / 58.0 |
| 持续滚动帧间隔 P95 | 74.9–116.9ms | 25.0–32.8ms |
| 末次 wheel 到最终可呈现位置，六段 | 99.1–158.5ms | 58.1–83.4ms |
| 上述拖尾时间中位数 | 120.3ms | 67.2ms |
| 末次 wheel 后可见位移中位数 | 42 面板 CSS px | 27 面板 CSS px |
| 每帧 JPEG 大小中位数 | 425.6KiB | 181.0KiB |

修复包六段最终位置均与总输入距离相符（误差不超过 2 个网页 CSS px），未测得反向位移。源码构建另测持续滚动 56.8–58.9fps、拖尾中位数 66.7ms。

“末次 wheel”是应用最后收到的滚轮事件，不是物理手指离开触控板的时刻。本次验证的是应用捕获与呈现的拖尾；macOS 触控板惯性占比、物理显示器扫描输出、其他站点和长期重负载未测。残余拖尾没有归零。

## 回归及证据

- 新增尺寸测试在旧源码失败（2048 != 1238），修复后通过，覆盖 fit、静态补帧、DPR 1/1.5/2、窄面板、上限、旧标签、无效倍率、失败回滚和快速路径。
- 捕获/输入/共享等定向单元测试 41 通过、1 原生项跳过；真实 Neo 专项 14/14 通过，含并发补帧、旧坐标拒绝、URL-only 连续性和共享控制权。
- 帧展示 4 项及视口 UI 6 项通过，验证旧解码隔离、倍率更新、fit/100%、窄高布局、选区、点击和滚动距离；视口用例新增 JPEG 物理尺寸断言。
- 修复包 URL 同步输入 20/20，无丢字且 epoch 不变；切换标签和调整窗口的原有用例通过，证据为 `packaged-url-input.json`。
- 倍率 UI 用例最初失败：单独用 CDP 改 DPR 时，测试浏览器更新数值但未派发媒体查询事件。最小复现确认增加 1px 宿主布局变化即可派发；最终用例固定面板 620×400，改变宿主宽度触发原生通知，没有手工派发事件或改产品逻辑绕过。原失败日志保留。
- `npm run typecheck`、构建及 ad-hoc 深度签名校验通过。性能探针仅观察真实配置，没有在运行时替换捕获参数。
- 最终通过实际新包启动到原数据目录，核对页面 URL 属于 `release/logo-v7-capture-fix`，窗口已置前，网页面板展开并显示有效画面。未修改用户站点内容。

证据在 `test-results/v7-capture-fix/`：`original-motion.json`、`source-motion.json`、`packaged-motion.json` 含配置、所有样本和原始轨迹；旧包性能断言失败日志、定向回归、构建与签名日志同目录保留。源文件修改前副本在 `.runtime/v7-capture-fix/before/`。

```sh
ATHENA_APP_EXECUTABLE="$PWD/release/logo-v7-capture-fix/mac-arm64/Athena.app/Contents/MacOS/Athena" \
  ATHENA_PERF_OUTPUT=test-results/v7-capture-fix/packaged-motion.json \
  node_modules/.bin/tsx tests/browser-scroll-motion.e2e.ts
```
