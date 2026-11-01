# 宽页帧等待超时：有限诊断结论

2026-11-01，对 [输入性能修复](neo-input-performance.md) 中保留的一次 fit-width 超时做补充诊断。结论：**已有的产品捕获竞争问题，测试正确捕捉到没有有效新画面的状态；不是本次 URL 输入优化新引入的问题。** 以下保留修复前诊断；后续已完成 [捕获恢复修复与验证](neo-capture-recovery.md)。

## 依据

1. 本次首次原生失败在 `tests/browser.test.ts:1904`：等待 `1100×1833` 的视口元数据和同比例 JPEG，8 秒未满足。此前 `test-results/agent-experience/native.log`、`native-final.log` 也在完全相同的调用点失败。
2. 用保存的修改前源码与当前源码，交替执行相同的最小原生用例，最多六组；使用同一已安装 Neo、独立临时 profile、本地静态页面，原测试 8 秒阈值和条件均保留。仅增加原始 screencast / 发布帧 / 捕获命令的记录。六次基线有两次复现，六次修复版未复现。小样本与诊断探针会改变时序，**这些次数不能说明新版本已经解决该竞争**；当前版此前的首次失败仍然有效。
3. 两次基线失败都记录到相同现场：原生 `innerWidth/innerHeight` 与布局指标正确，为 `1100×1833`；唯一发布的新帧却报告 `615×1024`，JPEG 为 `1230×2048`。接下来的 8 秒没有正确尺寸的原始帧，因此不是测试漏看瞬时正确帧，也不是纯粹的等待时长设置问题。
4. 错误帧的时间戳晚于画面失效时间约 55/70ms，并且确实被发布，没有被时间戳过滤。超时后仅改变本地 fixture 的一个背景色，在随后的 250ms 观察窗口内出现 `1100×1833` 元数据、`1229×2048` JPEG；布局尺寸未改变。

## 捕获竞争路径

触发场景是：刚导航到静态 1100px 宽页面，执行 fit 和点击，随后快速将面板从 `620×490` 调整为窄高的 `390×650`；实际 fit 视口成为 `1100×1833`。导航结束留下的 60ms 补帧任务恰好与新 screencast 重启交错。

两次失败的轨迹均为：

1. 正常设置 `1100×1833` 视口并重启 `Page.startScreencast`。
2. `refreshUnpaintedSurface` 执行 `Page.captureScreenshot`，为保持 2048px 上限设置 `clip.scale = 0.5586470267321331`。
3. 截图进行期间，screencast 返回 `615×1024` 的 viewport metadata；这正是原视口乘上述 scale 后的取整值。错误元数据被当作当前画面发布，增加 `frameSequence`，并将 `publishedEpoch` 标为当前。
4. 补帧截图完成时，已有的 `sequence !== this.frameSequence` 保护丢弃了它。由于没有发生新的页面代次变化，不会再次补帧。静态页也没有新的内容重绘，所以正确元数据一直未到来。

上述命令与元数据交错来自实测；对为什么补帧结果被丢弃、为何不重试的判断来自 `src/main/browser.ts` 的现有守卫。没有调小画质、放宽坐标断言或关闭截图来掩盖问题。

**影响**：BrowserPane 校验显示尺寸必须与已确认的视口一致。上述 `615×1024` 帧不满足 `1100×1833` 的期望，因而可能持续显示“正在显示页面”并阻止输入，直到页面另一次重绘或重新调整视口。此 UI 影响是代码路径推断；本次没有操纵用户正在使用的窗口。背景色重绘只用于超时后的本地诊断，未加入产品代码。

## 证据和后续范围

- 汇总：`test-results/neo-performance/fit-diagnosis/diagnosis.json`。
- 两次基线原始轨迹：`01-baseline.json`、`03-baseline.json`；六组运行记录：`runs.json`，均在上述目录。
- 可复查诊断脚本：`.runtime/fit-diagnosis/probe.test.ts` 与 `run.py`。仅提取原生失败点之前的原流程，记录 trace；超时后额外执行一次本地重绘检查。没有改动正式测试或产品代码。
- 后续修复已覆盖“缩放截图与 screencast 并发时，错误元数据不能终结补帧”的真实路径，使用确定性回归和相同六组真实对照验证；详见 [修复记录](neo-capture-recovery.md)。本页的两次失败数据仍作为修复前证据保留。

## 如何体验已完成的输入修复

独立包的显示名称是 **Athena**，版本仍为 **0.6.0**，路径为：

`release/neo-performance/mac-arm64/Athena.app`

只读进程核对时，仍在运行的是 PID 96889 的旧 `release/agent-experience/mac-arm64/Athena.app`。**当前旧应用没有自动更新，需用户退出旧 Athena，再手动打开上面的 neo-performance 包，才能体验本次输入修复。** 两个包名称、版本号和兼容 bundle ID 相同，应按完整路径区分，避免从旧 Dock 入口重新打开旧包。

诊断阶段没有退出用户应用、替换应用、提交、推送、发布或改动权限。当时仅含输入修复的预览包 `app.asar` SHA-256 为 `ce2555e34e50f7e57ad55d3a019066b5ce38da803899f9b90ad1696009b09e42`；该预览位置随后已更新为同时包含两个修复的构建，最新哈希见 `test-results/neo-performance/capture-fix/verification.json`。旧 agent-experience 应用仍保留。
