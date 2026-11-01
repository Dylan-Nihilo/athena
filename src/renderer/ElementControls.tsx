import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AlignCenter, AlignJustify, AlignLeft, AlignRight, Blend, Frame, Type } from 'lucide-react';
import {
  BorderStyleSample,
  ChoiceControl,
  ColorControl,
  InsetsControl,
  NumberControl,
  PropertySection,
  type Measurement,
} from '../../packages/element-inspector/src';
import {
  A2uiSurface,
  createComponentImplementation,
  type ReactCatalogComponent,
} from '@a2ui/react/v0_9';
import { Catalog, CommonSchemas, MessageProcessor } from '@a2ui/web_core/v0_9';
import { z } from 'zod';
import {
  controlProperties,
  controlData,
  defaultElementControls,
  elementControlMessages,
  ELEMENT_CATALOG_ID,
  ELEMENT_SURFACE_ID,
  type ElementControlSurface,
} from '../shared/element-controls';
import {
  ELEMENT_UNSAFE_CSS_PATTERN,
  type ElementDetails,
  type ElementEditResult,
} from '../shared/types';
import { LiveStyleQueue } from './LiveStyleQueue';

const Editing = createContext<{
  computed: Record<string, string>;
  preview: (property: string, value: string) => void;
  finish: () => void;
}>({ computed: {}, preview() {}, finish() {} });
const propertySchema = z.enum(
  Object.keys(controlProperties) as [
    keyof typeof controlProperties,
    ...(keyof typeof controlProperties)[],
  ],
);
const common = { label: z.string().max(40), property: propertySchema };
const Column = createComponentImplementation(
  { name: 'Column', schema: z.object({ children: CommonSchemas.ChildList }).strict() },
  ({ props, buildChild }) => (
    <div className="live-control-sections">
      {(props.children as string[]).map((id) => (
        <div key={id}>{buildChild(id)}</div>
      ))}
    </div>
  ),
);
const Group = createComponentImplementation(
  {
    name: 'Group',
    schema: z.object({ label: z.string().max(40), children: CommonSchemas.ChildList }).strict(),
  },
  ({ props, buildChild }) => (
    <PropertySection
      label={props.label}
      icon={props.label === '排版' ? <Type /> : props.label === '外观' ? <Blend /> : <Frame />}
    >
      {(props.children as string[]).map((id) => (
        <div key={id}>{buildChild(id)}</div>
      ))}
    </PropertySection>
  ),
);
const measurements: Partial<Record<keyof typeof controlProperties, Measurement>> = {
  'font-weight': 'weight',
  'font-size': 'size',
  'border-radius': 'radius',
  'border-width': 'stroke',
  'letter-spacing': 'tracking',
  opacity: 'opacity',
  width: 'width',
  height: 'height',
};
const Slider = createComponentImplementation(
  {
    name: 'Slider',
    schema: z
      .object({
        ...common,
        value: CommonSchemas.DynamicNumber,
        shorthand: CommonSchemas.DynamicString.optional(),
        min: z.number(),
        max: z.number(),
        step: z.number(),
        unit: z.enum(['px', '']),
      })
      .strict(),
  },
  ({ props }) => {
    const editing = useContext(Editing);
    if (props.property === 'padding')
      return (
        <InsetsControl
          label={props.label}
          value={props.shorthand ?? (props.value ?? props.min) + props.unit}
          min={props.min}
          max={props.max}
          step={props.step}
          onChange={(css) => {
            props.setShorthand(css);
            props.setValue(parseFloat(css));
            editing.preview('padding', css);
          }}
          onCommit={editing.finish}
        />
      );
    const raw = editing.computed[props.property] ?? '';
    const spec = controlProperties[props.property];
    const initial = Number.isFinite(parseFloat(raw))
      ? parseFloat(raw)
      : spec.type === 'Slider'
        ? spec.min
        : props.min;
    const scalar = /^-?(?:\d+\.?\d*|\.\d+)(?:px)?$/.test(raw);
    return (
      <NumberControl
        label={props.label}
        value={props.value ?? props.min}
        min={props.min}
        max={props.max}
        step={props.step}
        unit={props.unit}
        measurement={measurements[props.property] ?? 'spacing'}
        mixedValue={!scalar && props.value === initial ? raw : undefined}
        onChange={(value) => {
          props.setValue(value);
          editing.preview(props.property, value + props.unit);
        }}
        onCommit={editing.finish}
      />
    );
  },
);
const unsafeCss = new RegExp(ELEMENT_UNSAFE_CSS_PATTERN, 'i');
const ColorPicker = createComponentImplementation(
  {
    name: 'ColorPicker',
    schema: z.object({ ...common, value: CommonSchemas.DynamicString }).strict(),
  },
  ({ props }) => {
    const editing = useContext(Editing);
    return (
      <ColorControl
        isAllowed={(value) => !unsafeCss.test(value)}
        label={props.label}
        value={props.value ?? ''}
        onChange={(value) => {
          props.setValue(value);
          editing.preview(props.property, value);
        }}
        onCommit={editing.finish}
      />
    );
  },
);
const choiceLabels: Record<string, string> = {
  none: '无',
  solid: '实线',
  dashed: '虚线',
  dotted: '点线',
  double: '双线',
  left: '左对齐',
  center: '居中',
  right: '右对齐',
  justify: '两端对齐',
  block: '块级',
  'inline-block': '行内块',
  flex: '弹性布局',
  grid: '网格',
  'inline-flex': '行内弹性',
  row: '横向',
  column: '纵向',
  'row-reverse': '横向反转',
  'column-reverse': '纵向反转',
  stretch: '拉伸',
  'flex-start': '起点',
  'flex-end': '终点',
  baseline: '基线',
  'space-between': '两端分布',
  'space-around': '均匀环绕',
  'space-evenly': '等距分布',
};
const ChoicePicker = createComponentImplementation(
  {
    name: 'ChoicePicker',
    schema: z
      .object({
        ...common,
        value: CommonSchemas.DynamicString,
        options: z.array(z.string().max(40)).max(8),
      })
      .strict(),
  },
  ({ props }) => {
    const editing = useContext(Editing);
    const alignIcons = {
      left: AlignLeft,
      center: AlignCenter,
      right: AlignRight,
      justify: AlignJustify,
    };
    return (
      <ChoiceControl
        label={props.label}
        value={props.value ?? ''}
        options={(props.options as string[]).map((value) => {
          const Icon =
            props.property === 'text-align'
              ? alignIcons[value as keyof typeof alignIcons]
              : undefined;
          return {
            value,
            label: choiceLabels[value] || value,
            icon: Icon && <Icon size={15} aria-hidden />,
            preview: props.property === 'border-style' && <BorderStyleSample value={value} />,
          };
        })}
        onChange={(value) => {
          props.setValue(value);
          editing.preview(props.property, value);
          editing.finish();
        }}
      />
    );
  },
);
const catalog = new Catalog(
  ELEMENT_CATALOG_ID,
  'v0.9.1',
  [Column, Group, Slider, ColorPicker, ChoicePicker],
  [],
);

export default function ElementControls({
  element,
  surface,
  onAction,
  onCommit,
}: {
  element: ElementDetails;
  surface?: ElementControlSurface;
  onAction: <T>(name: string, payload: unknown) => Promise<T>;
  onCommit: (result: ElementEditResult) => void;
}) {
  const [status, setStatus] = useState('');
  const callbacks = useRef({ onAction, onCommit });
  callbacks.current = { onAction, onCommit };
  const controls = useMemo(
    () => surface?.controls ?? defaultElementControls(element),
    [element.ref, surface?.revision],
  );
  const processor = useMemo(() => {
    const processor = new MessageProcessor<ReactCatalogComponent>([catalog], undefined, {
      version: 'v0.9.1',
    });
    processor.processMessages(elementControlMessages(element, controls));
    return processor;
  }, [element.ref, controls]);
  const model = processor.model.surfacesMap.get(ELEMENT_SURFACE_ID)!;
  const queue = useMemo(
    () =>
      new LiveStyleQueue(
        element.ref,
        (name, payload) => callbacks.current.onAction(name, payload),
        (result) => {
          callbacks.current.onCommit(result);
          setStatus('已预览，可撤销');
        },
        setStatus,
      ),
    [element.ref, controls],
  );
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (!queue.busy)
        processor.processMessages([
          {
            version: 'v0.9.1',
            updateDataModel: {
              surfaceId: ELEMENT_SURFACE_ID,
              value: controlData(element, controls),
            },
          },
        ]);
    });
    return () => cancelAnimationFrame(frame);
  }, [element, queue, processor, controls, status]);
  useEffect(
    () => () => {
      queue.dispose();
      processor.dispose();
    },
    [queue, processor],
  );
  return (
    <Editing.Provider
      value={{
        computed: element.computed,
        preview: (property, value) => {
          setStatus('');
          queue.enqueue(property, value);
        },
        finish: () => {
          void queue.finish();
        },
      }}
    >
      <div className="element-live-controls">
        <A2uiSurface surface={model} />
        <p className="inspector-note" role="status">
          {status}
        </p>
      </div>
    </Editing.Provider>
  );
}
