# 本机 CLI 适配

## 已确认范围

- Codex、Claude Code、Gemini CLI、Pi、Cursor Agent；优先使用用户已有的本机安装、登录与 Provider 配置，不改写凭据或 CLI 配置。
- 应用级默认执行器，新会话可以改选；每个对话固定执行器，不自动迁移会话、不静默切换或安装 CLI。
- 先验证 Pi 的真实执行闭环，再扩展其余执行器。真实模型调用已获用户授权，验证在隔离临时目录中进行。
- 核心任务、流式输出、续聊和停止优先。浏览器、元素调整等能力只有在宿主授权链路接通后才开放；不通过自动批准绕过差异。

## Pi 协议适配阶段

`src/main/agent-session.ts` 定义宿主执行接口，Codex 保留原有协议实现。`src/main/pi-session.ts` 使用 Pi JSONL RPC：按请求 ID 关联响应，以 LF 分帧，以 `agent_settled` 判断最终完成，而非 `prompt` 响应或 `agent_end`。不展示 thinking、原始 stderr 或凭据诊断。

启动时仅加载 Athena 的 `resources/cli/pi-permissions.mjs` 授权扩展，关闭项目扩展/MCP/技能/模板的自动加载，不改写用户文件。保留本机 Provider/模型与登录配置。原生工具每次执行都通过宿主审批；没有授权扩展握手则拒绝执行。Pi 尚未接通 Neo 浏览器工具，不能把原生文件/命令工具当作网页操作支持。

会话恢复使用原始 Pi session ID，不通过拼接历史假装原生恢复。停止先清除队列再 abort；无法确认停止时终止当前进程组。用量取自当前任务实际消息记录，缺失字段保持未知；模型证据来自当前消息中的 CLI 元数据，不来自模型自述。

验证入口：

```bash
npx tsx --test tests/pi-session.test.ts
WORKBENCH_LIVE_PI=1 WORKBENCH_PI_PATH="$(command -v pi)" npx tsx tests/pi-live.e2e.ts
```

真实验证包含临时目录写入/读回与审批、流式输出、关闭并恢复同一原生会话、用量与当前模型证据，以及流式中停止。测试不会自动批准任意命令；只允许临时文件 evidence.txt 的指定 read/write。该阶段通过不代表 Athena UI 集成或其他 CLI 已完成。

当前主分支新增 HugeIcons Pro 私服依赖；本机尚缺相应包与 `HUGEICONS_NPM_TOKEN`，完整 renderer 类型检查和 UI 构建仍需恢复授权依赖。不得用空模块或图标替身伪造构建成功。
