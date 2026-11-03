# Athena 设计约定

本文件定义当前应用的视觉与交互方向。修改用户可见界面前先读这里，并检查实际组件、状态与数据来源；Figma 是视觉参考，应用能力和真实结果以当前代码与运行验证为准。

## 视觉方向

使用白底、黑灰文字与克制的表面层级。主要操作采用黑色实心按钮；品牌、服务标识和少量状态图标保留颜色，避免把整页染成蓝紫色或用渐变、玻璃效果替代信息层级。

- 主工作区使用 `--surface`，侧栏及次级区域使用 `--background`。
- 卡片用轻柔的 `--surface-shadow` 建立层级；浮层使用 `--overlay-shadow`。不靠连续粗描边分割所有内容。
- 嵌套在卡片里的字段、选项和参数区使用灰色 `--surface-secondary`，不重复叠加阴影。
- 保留必要的分隔线、选中边界、错误和键盘焦点。去掉默认描边不等于去掉可操作性提示。
- 用量、列表和连续内容优先使用自然分组与留白，避免每一行都套卡片。
- 深色模式使用同一套语义 token；不把浅色阴影或白色背景写死在组件内。

当前 token 定义在 [theme.css](src/renderer/theme.css)。通用样式在 [styles.css](src/renderer/styles.css)，各支撑表面有独立样式文件。

| 用途                       | Athena 约定                                    |
| -------------------------- | ---------------------------------------------- |
| 输入框、选择框、灰色参数区 | 12px 圆角；默认无描边；独立字段可用 field 阴影 |
| 按钮                       | 24px 圆角；图标按钮按实际尺寸保持圆形          |
| 卡片、任务请求、共享表面   | 24px 圆角；surface 轻影                        |
| 任务输入框                 | 24px 圆角；工具条始终可见                      |
| 模型与选择浮层             | 22px 圆角；overlay 轻影                        |
| 侧栏导航与选项             | 按上下文使用 12–16px 圆角与灰色选中表面        |

这些是 Athena 在 HeroUI 原生样式上的约定，不代表每个 HeroUI 组件的默认值。不要为了统一圆角覆盖原生焦点、禁用、加载或错误状态。

## 组件库与版本

优先复用现有 HeroUI/Pro 组件、项目包装和平台能力；不为已有控件再造组件库或添加依赖。以下版本来自当前 [package.json](package.json)，精确安装结果以 `package-lock.json` 为准。

| 依赖                              | 当前声明        |
| --------------------------------- | --------------- |
| `@heroui/react`、`@heroui/styles` | `3.2.7`         |
| `@heroui-pro/react`               | `1.0.0-beta.10` |
| React、React DOM                  | `^19.3.1`       |
| Tailwind CSS / Vite 插件          | `4.3.3`         |
| React Aria Components             | `1.22.1`        |
| Motion                            | `14.9.0`        |
| `@hugeicons-pro/core-stroke-rounded` | `4.4.0`         |
| `@hugeicons/react`                | `1.1.10`        |

使用 HeroUI v3 的 compound API，例如 `Card.Header`、`Popover.Content`；交互组件使用 `onPress`。通用选择使用现有 `ChoiceSelect`，工具栏按钮使用 `ActionButton`。保留隐藏的原生表单辅助节点，不用自制点击层破坏键盘操作。

HeroUI Pro 需要有效商业授权。沿用项目安装脚本和授权缓存，不把完整 Pro 包或密钥加入源码；许可见 [第三方声明](THIRD_PARTY_NOTICES.md)。

## 实际组件映射

| 表面                     | 代码入口                                                                                                                                          | 已复用的组件或能力                                                         |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| 应用壳、侧栏、对话与输入 | [App.tsx](src/renderer/App.tsx)                                                                                                                   | Pro Sidebar、PromptInput、ChatMessage；HeroUI Tabs、Card                   |
| 本机用户菜单、网页上下文 | [HomeMenus.tsx](src/renderer/HomeMenus.tsx)                                                                                                       | Avatar、Dropdown、Button                                                   |
| 当前工作区对话搜索       | [ConversationSearch.tsx](src/renderer/ConversationSearch.tsx)                                                                                     | Pro Command；真实标题和消息过滤                                            |
| 首次配置与继续准备       | [Onboarding.tsx](src/renderer/Onboarding.tsx)                                                                                                     | 连续对话记录、HeroUI 操作与状态表面、真实宿主准备流程                      |
| 模型与推理强度           | [ModelPicker.tsx](src/renderer/ModelPicker.tsx)                                                                                                   | Popover、Slider、ChoiceSelect                                              |
| 通用选择与工具按钮       | [ChoiceSelect.tsx](src/renderer/ChoiceSelect.tsx)、[ui.tsx](src/renderer/ui.tsx)                                                                  | Select/ListBox、Button/Tooltip                                             |
| 执行、计划、核对与产物   | [ExecutionPanel.tsx](src/renderer/ExecutionPanel.tsx)                                                                                             | Pro ListView、Disclosure、Button                                           |
| 审批与结构化回答         | [RequestPanel.tsx](src/renderer/RequestPanel.tsx)                                                                                                 | RadioGroup、Input、TextArea、ActionButton                                  |
| 用量与价格依据           | [UsagePanel.tsx](src/renderer/UsagePanel.tsx)                                                                                                     | Card、Tabs、Disclosure、ChoiceSelect                                       |
| 浏览器画面与工具栏       | [BrowserPane.tsx](src/renderer/BrowserPane.tsx)                                                                                                   | Pro Segment、HeroUI Tabs；现有帧与输入链路                                 |
| 共享主持人及访客         | [SharePanel.tsx](src/renderer/SharePanel.tsx)、[SharedPage.tsx](src/renderer/SharedPage.tsx)、[SharedSurface.tsx](src/renderer/SharedSurface.tsx) | Modal、Input、ChoiceSelect；真实共享状态与画面                             |
| 元素检查与调整           | [ElementInspector.tsx](src/renderer/ElementInspector.tsx)、[ElementControls.tsx](src/renderer/ElementControls.tsx)                                | [独立元素控件库](packages/element-inspector/README.md)、受约束的 A2UI 控件 |

支撑样式分别位于 [agent-experience.css](src/renderer/agent-experience.css)、[model-controls.css](src/renderer/model-controls.css)、[usage-currency.css](src/renderer/usage-currency.css)、[sharing.css](src/renderer/sharing.css) 和 [inspector-surface.css](src/renderer/inspector-surface.css)。

## 品牌与图标

正式应用标识使用 [athena-profile.png](src/renderer/assets/brand/athena-profile.png)，打包图标使用项目既有 resources 资产。不要替换为未选定的 v7 或其他候选素材，也不要引用临时 Figma 图片 URL。

CLI 和服务标识保留上游图形与原色，来源见 [图标说明](src/renderer/assets/agents/README.md)。通用操作图标使用 HugeIcons Pro 的 Stroke Rounded 风格，通过 `HugeiconsIcon` 渲染。语义相同的动作保持一致。

侧栏用户头像来自本机用户名字首字母，名称由本机状态提供；它不是账号登录、云端身份或订阅入口。没有真实账户服务时不添加账户、订阅和计费管理界面。

## 状态与数据

- **首次引导**：使用独立的连续对话流，保留 Athena 的说明、用户点击后的回复和真实操作结果；它不写入项目聊天记录、不调用模型生成开场。开场头像与标题横向排列，沿用 760px 内容宽度、56px 正式头像和 36/48 标题。
- **引导滚动与动效**：新内容向上推进；用户回看时不抢滚动，提供回到最新入口。顶部渐变模糊只淡出滚过的历史，不遮当前动作、不拦截点击或键盘。动作由真实事件推进，入场只播放一次；减少动态效果时移除位移、缩放和延迟。
- **准备与恢复**：旧用户不强制重复引导；可从设置重开，未切换目录时退出保留原草稿与会话。目录先选择候选、再确认并核对可访问性；取消不替换旧目录。确认切换项目后，清空未发送草稿与元素源码上下文，防止发送到新项目，已有对话保留。安装、登录和权限不能用定时动画或“我已完成”按钮认定成功，重开时复查已确认条件。浏览器可稍后准备。
- **任务输入**：空输入不可发送；中文输入法确认不提交；Shift+Enter 换行。发送成功后才清空草稿，失败和停止后保留草稿。
- **上下文**：移除元素引用不自动改写或清空草稿。网页未就绪时，依赖浏览器的操作不可伪装为可用。
- **任务进行中**：可继续编辑草稿，但不把草稿显示为已加入发送队列；停止按钮停止当前任务。未经实现与验证，不增加自动排队行为。
- **计划与结果**：展示公开计划、真实工具动作、核对证据、人工处理和产物；不编造进度百分比、成功结果或隐藏推理。
- **模型**：选项来自当前 CLI 能力；用户选择与实际本轮执行模型分别确认。其他 CLI 仅被检测到，不等于可执行。
- **用量**：保留 **USD API 等价估算为第一主指标、每日 USD 图优先**。Token、输入/输出为次级数据；Figma 的 Token 优先例图是较早快照，不得据此反转当前产品行为。
- **未知值**：缺少费用、费率、模型或 Token 字段时保持未知/部分数据；真实零值和未采集到数据必须区分。API 等价估算不是订阅实际扣费。
- **共享**：角色权限与当前控制权分开表达；仅查看者不能操作。共享结束后显示结束状态，不继续显示可操作或可交接。
- **错误与恢复**：保留具体失败与可行下一步；结果未知时先核对，不能用“重试”暗示可以安全重复提交。

产品文案只服务用户任务。需求描述、开发状态、设计理由、技术取舍和审计说明应放在文档或开发工具，不进入按钮、空状态、提示卡片或演示数据。

## 设计参考与实现边界

- [主应用与支撑页面](https://www.figma.com/design/vEL0JeDlefvuvLjUQQh5SB)
- [当前首页交互](https://www.figma.com/design/vEL0JeDlefvuvLjUQQh5SB?node-id=104-1874)
- [首次引导](https://www.figma.com/design/vEL0JeDlefvuvLjUQQh5SB?node-id=126-3379)
- [用量参考](https://www.figma.com/design/vEL0JeDlefvuvLjUQQh5SB?node-id=31-1079)
- [共享桌面与手机参考](https://www.figma.com/design/vEL0JeDlefvuvLjUQQh5SB?node-id=31-1494)
- [Agent 工具执行](https://www.figma.com/design/jIaBK8NMvfZsjuMktNwpfO?node-id=14-1092)
- [Agent 提问与结构化回答](https://www.figma.com/design/jIaBK8NMvfZsjuMktNwpfO?node-id=9-3819)

当前界面已接入首页菜单/搜索、真实 Codex 任务、模型与用量、元素编辑、页面共享及已有飞书配置。设计中的样例人物、任务、金额、文件和网页内容必须替换为应用实际数据。

通用 MCP 服务配置与管理、多 Agent 并行调度、更多 CLI 执行器、账户/订阅服务和桌面 Computer Use 尚未实现。已有内部 Neo MCP 网页工具链不等于通用 MCP 产品能力；Figma 中的未来状态不能作为后端支持证明。

主持人共享沿用现有 Modal 入口；访客页沿用实际共享流。若设计参考中的按钮没有对应权限或协议，先保留准确状态，不放置无法兑现的操作。

## 验证要求

先完成与改动相称的类型、功能和隔离 UI 检查，再看真实渲染。检查焦点、键盘、输入法、草稿、加载、失败、停止、窄窗口和减少动态效果；滚动区内部裁切与非预期溢出要分开判断。

截图必须来自当前真实应用或明确标注的隔离组件测试，不能用 Figma 稿替代实现证据。共享帧和第三方网页保持真实内容与原比例；不要为了视觉对齐改变点击坐标、文档代次或权限验证。
