# 本机 CLI 适配

## 使用与范围

- 首批包括 Codex、Claude Code、Gemini CLI、Pi、Cursor Agent，使用用户已有安装、登录与 Provider 配置。不会自动安装、登录或切换到其他 CLI。
- 设置中的默认 CLI 只用于新对话；输入栏可为新对话改选 CLI。已有消息或原生执行会话的对话不能重绑，切换时创建新对话。旧档案缺少 `agent` 的对话仍为 Codex，不随应用默认值改变。
- 对话保存原始 CLI session ID，只能由对应适配器恢复；恢复失败不自动换新 ID，也不用拼接可见历史假装恢复。模型选择与目录缓存按 CLI 隔离。手动刷新会使空闲连接重新读取本机配置；任务进行中则延后到任务结束，不只凭路径、版本或登录方式相同就复用旧账户配置。
- 模型目录来自 CLI。未提供可靠目录的 CLI 沿用本机默认配置，不编造选项。实际本轮模型另取 CLI 消息元数据，不把初始化配置或模型自述当作执行证据。
- 浏览器工具和元素调整目前仅向 Codex 开放。其他 CLI 没有宿主 Neo 授权桥接，不自动接管网页。未完成的审批能力不以自动批准代替。

## 能力与验证矩阵

| CLI          | 当前执行模式                                         | 本轮验证情况                                                                                       |
| ------------ | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Codex        | 保留 app-server、本地工具审批与 Neo 浏览器链路       | 既有协议/用量/引导回归；当前本机登录探针为 missing，未重做真实模型调用                             |
| Pi           | 长驻 RPC；本地工具每次通过 Athena 审批               | 真实模型：临时文件写入/读回、审批、流式、原生会话恢复、用量、实际模型证据、停止通过                |
| Claude Code  | 原生 stream-json；仅文本任务，关闭本地工具与 MCP     | 真实模型：回复、流式、关闭后原生恢复与停止通过；取得消息模型和用量证据                             |
| Cursor Agent | 原生 stream-json；Ask 只读模式，不运行写入/命令      | 协议测试通过；真实调用因本机未登录失败，`cursor-agent status` 确认需要登录。没有自动登录或重放任务 |
| Gemini CLI   | 原生 stream-json；临时 deny 工具策略，不启用原生工具 | 本机未安装，未做真实验证；安装后仍需支持所需受限模式参数，否则不可选                               |
| OpenCode     | 保留安装检测兼容项                                   | 本轮不接通执行，不可选为任务执行器                                                                 |

**验证层级不能合并：** 上述 Pi/Claude 的真实结果来自直接调用生产适配器的隔离脚本，不等于 Athena 完整 UI 验收。宿主、选择器、默认设置与引导接线已修改源码；本机缺 HugeIcons Pro 私服授权依赖，`npm ci` 返回 E401，完整项目类型检查、renderer 构建及 UI 实机验收尚未完成。需要在本机配置 `HUGEICONS_NPM_TOKEN` 并成功 `npm ci` 后继续。未用空模块、替代图标包或伪造声明绕过授权。

## 实现边界

- `src/main/agent-session.ts`：宿主公共接口；各适配器自行拥有协议、会话、停止与事件转换，不能拥有宿主授权。
- `src/main/agent-discovery.ts`：检查 PATH、常见本机目录、nvm/fnm；realpath 去重，损坏 shim 不遮住其他可用安装。不执行 shell 启动文件，不把 Cursor 编辑器命令当 Agent，不把 `agent` 别名算成第二个提供商。Codex 现有私有安装回退保持兼容。
- `src/shared/agents.ts`：旧对话执行器归属、模型选择隔离与浏览器能力边界。
- 保留 `codex:state`、`CodexConnectionState` 与 snapshot 的 `codexConnection` 兼容标识；它们承载当前所选会话的连接状态，不据此声称所有执行器均为 Codex。
- CLI/session/conversation 标识仅用于归属，执行工具与审批仍绑定当前任务；未知费用和用量字段保持未知，USD API 等价估算的优先级不变。

### Pi

`src/main/pi-session.ts` 按请求 ID 关联 JSONL 响应，仅按 LF 分帧，以 `agent_settled` 判断最终完成，而非 `prompt` 响应或 `agent_end`。不展示 thinking、原始 stderr 或凭据诊断。工具参数超过可完整审阅的审批长度时直接阻止，不允许只看截断命令就批准执行。

只加载 Athena 的 `resources/cli/pi-permissions.mjs` 授权扩展，关闭扩展/MCP/技能/模板的自动加载，不改写用户配置；保留 CLI 原生 Provider、模型与登录配置。依赖额外 Pi 扩展注册的 Provider 不在当前受限加载模式的支持范围。启动时没有授权扩展握手则拒绝执行。打包后的扩展由宿主复制到应用私有 runtime 目录，外部 Pi 进程不直接读取 Electron asar。

恢复使用原始 Pi session ID。停止先清除队列再 abort；无法确认停止时终止当前进程组，即使 leader 先退出仍清理后代。没有通过给模型发送“请停止”来模拟停止。

### Claude / Gemini / Cursor

协议依据、参数限制、事件与安全模式见 [CLI 协议依据](cli-protocol-evidence.md)。这些适配器不是通用 MCP 接入，不是 OS 沙箱，也不提供未实现的原生审批或人工提问桥接。收到无法处理的原生审批请求会报错并停止。

## 验证入口

本轮选定的后端、协议、用量及引导回归共 **187 项通过、0 项失败、0 项跳过**。宿主严格类型检查及宿主打包通过；renderer 仅做了入口语法检查，完整 UI 验收仍受前述私服依赖阻塞。

```bash
npx tsx --test tests/pi-session.test.ts tests/pi-permissions.test.ts tests/stream-cli-session.test.ts tests/cli-selection.test.ts

# 真实模型调用，需要明确授权；可能计费。
WORKBENCH_LIVE_PI=1 WORKBENCH_PI_PATH="$(command -v pi)" npm run test:live-pi
WORKBENCH_LIVE_CLI=claude WORKBENCH_CLI_PATH="$(command -v claude)" npm run test:live-cli
# Cursor 先由用户在终端登录，再用同一脚本验收；Gemini 先由用户安装。
```

Pi 真实测试只自动批准隔离目录 evidence.txt 的指定 read/write，不批准任意命令；Claude/Cursor 真实脚本仅请求文本，不请求文件、shell 或外部消息。临时项目删除后，CLI 自身正常保存的原生会话仍遵循各自的本机存储规则，不提交到 Git。

本轮后端使用真实公共依赖做独立严格类型检查，宿主打包与修改后的 renderer 入口语法检查通过；它们不能替代上述待完成的全项目构建和 UI 验收。旧测试夹具把 Node 路径直接放进 shebang，在带空格的 fnm 路径下会 ENOENT；现通过 `tests/node-script.ts` 的可执行 JS 头修复夹具，并覆盖带空格、单引号的 Node 路径及参数透传，不改变生产执行器或放宽断言。
