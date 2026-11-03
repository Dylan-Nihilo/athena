# Athena 元素控件

用于实时 CSS 编辑的受控 React 组件。公共入口为 `src/index.ts`。库只处理属性值和交互，宿主负责选区、预览与撤销。独立样张使用同一入口，无需启动 Electron。

在工作树根目录安装 Athena 的依赖后，运行以下命令。

```sh
npm --prefix packages/element-inspector run dev
npm --prefix packages/element-inspector run build
```

单独在本包目录安装时，先在环境中设置 CollectUI 分发的 `HUGEICONS_NPM_TOKEN`，再执行 `npm install --userconfig ../../.npmrc`，以复用仓库的 HugeIcons Pro registry 配置。

构建输出在此包的 `dist/` 中，包含 ES 模块、TypeScript 声明与独立样式表。消费构建产物时引入包入口及其样式。

```tsx
import { NumberControl } from '@athena/element-inspector';
import '@athena/element-inspector/style.css';

<NumberControl
  label="圆角"
  measurement="radius"
  value={radius}
  min={0}
  max={200}
  step={1}
  unit="px"
  onChange={previewRadius}
  onCommit={finishGesture}
/>;
```

| 组件                                                     | 交互约定                                                                                                                |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `NumberControl`                                          | 拖动或方向键触发 `onChange`，手势结束触发 `onCommit`。数值框支持精确输入，Enter 或失焦提交，Escape 恢复。               |
| `ColorControl`                                           | 色板、色相、透明度与 HEX 共用一个颜色值。文本框接受 CSS 颜色，空串交给宿主清除覆盖。宿主可用 `isAllowed` 限制可用语法。 |
| `ChoiceControl`                                          | 带图标的选项使用可键盘操作的单选组，其余使用独立浮层选择菜单，支持方向键、Enter 与 Escape。保留选项之外的原始 CSS 值。  |
| `InsetsControl`                                          | 读取一至四个 CSS 像素值，自动识别不等边内边距。可分别编辑四边或切换为统一滑块。切换模式本身不会写入页面。               |
| `PropertySection`、`PropertyField`                       | 按属性分组，按容器宽度排布，标签与表单输入关联。                                                                        |
| `InspectorInput`、`InspectorSelect`、`InspectorTextarea` | 用于搜索、内容、原始 CSS 和动效表单。选择器通过 options、value 和 onChange 接入。                                       |

样式通过 `--ei-*` 变量定义。正文与标签使用系统字体，数值与单位使用等宽字。默认编辑面高 34px、圆角 7px。靛蓝用于可调范围、选中项与键盘焦点，透明度使用棋盘底纹。覆盖主题时在根节点设置变量，使颜色浮层也能继承。

颜色值以 CSS 字符串保存。色盘在 sRGB 中编辑，宽色域原值在实际操作色盘前保持原样。数值控件的步长控制滑轨与键盘增量，精确输入允许范围内的小数。
