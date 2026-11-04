import { useState, type CSSProperties } from 'react';
import { createRoot } from 'react-dom/client';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  BlendIcon,
  FrameIcon,
  RotateLeft01Icon,
  ScanIcon,
  TextAlignCenterIcon,
  TextAlignJustifyCenterIcon,
  TextAlignLeftIcon,
  TextAlignRightIcon,
  TextFontIcon,
} from '@hugeicons-pro/core-stroke-rounded';
import {
  BorderStyleSample,
  ChoiceControl,
  ColorControl,
  InsetsControl,
  NumberControl,
  PropertySection,
} from '../src';
import './preview.css';

const initial = {
  backgroundColor: '#ecebf6',
  color: '#45416d',
  borderRadius: 14,
  opacity: 1,
  fontSize: 30,
  fontWeight: 500,
  textAlign: 'center' as CSSProperties['textAlign'],
  padding: '24px 36px',
  borderStyle: 'solid',
};
const alignments = [
  { value: 'left', label: '左对齐', icon: <HugeiconsIcon icon={TextAlignLeftIcon} aria-hidden /> },
  {
    value: 'center',
    label: '居中',
    icon: <HugeiconsIcon icon={TextAlignCenterIcon} aria-hidden />,
  },
  {
    value: 'right',
    label: '右对齐',
    icon: <HugeiconsIcon icon={TextAlignRightIcon} aria-hidden />,
  },
  {
    value: 'justify',
    label: '两端对齐',
    icon: <HugeiconsIcon icon={TextAlignJustifyCenterIcon} aria-hidden />,
  },
];
function Preview() {
  const [style, setStyle] = useState(initial);
  const [revision, reset] = useState(0);
  const update = <K extends keyof typeof initial>(key: K, value: (typeof initial)[K]) =>
    setStyle((previous) => ({ ...previous, [key]: value }));
  const onCommit = () => {};
  return (
    <main className="specimen">
      <header className="specimen-header">
        <HugeiconsIcon icon={ScanIcon} aria-hidden />
        <span>Athena</span>
        <i aria-hidden>/</i>
        <h1>元素控件</h1>
        <button
          type="button"
          onClick={() => {
            setStyle(initial);
            reset((v) => v + 1);
          }}
        >
          <HugeiconsIcon icon={RotateLeft01Icon} size={13} aria-hidden />
          恢复默认
        </button>
      </header>
      <div className="specimen-workspace">
        <section className="specimen-artboard" aria-label="实时预览">
          <div className="specimen-caption">
            <strong>实时预览</strong>
            <code>&lt;p&gt;</code>
          </div>
          <div className="specimen-stage">
            <div className="specimen-selection">
              <p style={style}>文字样张 Aa</p>
              <i />
              <i />
              <i />
              <i />
            </div>
          </div>
          <div className="specimen-source">
            <h2>CSS</h2>
            <pre>
              {Object.entries(style).map(([key, value]) => {
                const name = key.replace(/[A-Z]/g, (char) => '-' + char.toLowerCase());
                const unit = key === 'fontSize' || key === 'borderRadius' ? 'px' : '';
                return (
                  <span key={key}>
                    {name}:{' '}
                    <b>
                      {value}
                      {unit}
                    </b>
                    ;{'\n'}
                  </span>
                );
              })}
            </pre>
          </div>
        </section>
        <aside key={revision} className="specimen-controls" aria-label="调整元素">
          <PropertySection label="外观" icon={<HugeiconsIcon icon={BlendIcon} aria-hidden />}>
            <ColorControl
              label="背景颜色"
              value={style.backgroundColor}
              onChange={(v) => update('backgroundColor', v)}
              onCommit={onCommit}
            />
            <NumberControl
              label="圆角"
              measurement="radius"
              unit="px"
              value={style.borderRadius}
              min={0}
              max={80}
              step={1}
              onChange={(v) => update('borderRadius', v)}
              onCommit={onCommit}
            />
            <NumberControl
              label="透明度"
              measurement="opacity"
              value={style.opacity}
              min={0}
              max={1}
              step={0.01}
              onChange={(v) => update('opacity', v)}
              onCommit={onCommit}
            />
            <ChoiceControl
              label="边框样式"
              value={style.borderStyle}
              options={[
                { value: 'solid', label: '实线' },
                { value: 'dashed', label: '虚线' },
                { value: 'dotted', label: '点线' },
                { value: 'none', label: '无' },
              ].map((option) => ({
                ...option,
                preview: <BorderStyleSample value={option.value} />,
              }))}
              onChange={(v) => update('borderStyle', v)}
            />
          </PropertySection>
          <PropertySection label="排版" icon={<HugeiconsIcon icon={TextFontIcon} aria-hidden />}>
            <ColorControl
              label="文字颜色"
              value={style.color}
              onChange={(v) => update('color', v)}
              onCommit={onCommit}
            />
            <NumberControl
              label="字号"
              measurement="size"
              unit="px"
              value={style.fontSize}
              min={8}
              max={64}
              step={1}
              onChange={(v) => update('fontSize', v)}
              onCommit={onCommit}
            />
            <NumberControl
              label="字重"
              measurement="weight"
              value={style.fontWeight}
              min={100}
              max={900}
              step={100}
              onChange={(v) => update('fontWeight', v)}
              onCommit={onCommit}
            />
            <ChoiceControl
              label="文字对齐"
              value={style.textAlign || ''}
              options={alignments}
              onChange={(v) => update('textAlign', v as CSSProperties['textAlign'])}
            />
          </PropertySection>
          <PropertySection label="布局与间距" icon={<HugeiconsIcon icon={FrameIcon} aria-hidden />}>
            <InsetsControl
              label="内边距"
              value={style.padding}
              min={0}
              max={80}
              step={1}
              onChange={(v) => update('padding', v)}
              onCommit={onCommit}
            />
          </PropertySection>
        </aside>
      </div>
    </main>
  );
}
createRoot(document.getElementById('root')!).render(<Preview />);
