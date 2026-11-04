import { useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { Link02Icon, Unlink02Icon } from '@hugeicons-pro/core-stroke-rounded';
import { PropertyField } from './fields';
import { NumericEntry } from './NumericEntry';
import { NumberControl } from './NumberControl';

function pixelSides(value: string) {
  const parts = value.trim().split(/\s+/);
  if (parts.length > 4 || parts.some((part) => !/^(?:\d+\.?\d*|\.\d+)px$/.test(part))) return;
  const [top, right = top, bottom = top, left = right] = parts.map(parseFloat);
  return [top, right, bottom, left];
}

export function InsetsControl({
  label,
  value,
  min,
  max,
  step,
  disabled,
  onChange,
  onCommit,
}: {
  label: string;
  value: string;
  min: number;
  max: number;
  step: number;
  disabled?: boolean;
  onChange: (css: string) => void;
  onCommit: () => void;
}) {
  const sides = pixelSides(value);
  const mixed = !sides || !sides.every((v) => v === sides[0]);
  const [splitMode, setSplitMode] = useState(mixed);
  const split = !!sides && splitMode;
  const toggle = sides && (
    <button
      type="button"
      className="ei-link"
      disabled={disabled}
      aria-label={label + '分别调整四边'}
      title={split ? '统一调整四边' : '分别调整四边'}
      aria-pressed={split}
      onClick={() => setSplitMode(!split)}
    >
      <HugeiconsIcon icon={split ? Unlink02Icon : Link02Icon} size={13} aria-hidden />
    </button>
  );
  if (!split || !sides)
    return (
      <NumberControl
        label={label}
        action={toggle}
        measurement="spacing"
        value={sides?.[0] ?? min}
        mixedValue={mixed ? value : undefined}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        unit="px"
        onChange={(n) => onChange(n + 'px')}
        onCommit={onCommit}
      />
    );
  return (
    <PropertyField label={label} action={toggle}>
      <div className="ei-edges">
        {['上', '右', '下', '左'].map((side, index) => (
          <div className="ei-edge" key={side} title={side + label}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
              <rect x="3" y="3" width="10" height="10" rx="1" stroke="var(--ei-rule)" />
              <path
                d="M3 3h10"
                stroke="currentColor"
                strokeWidth="2"
                transform={`rotate(${index * 90} 8 8)`}
              />
            </svg>
            <NumericEntry
              label={side + label + '数值'}
              min={min}
              max={max}
              step={step}
              value={sides[index]}
              disabled={disabled}
              unit="px"
              onSubmit={(n) => {
                onChange(sides.map((v, i) => (i === index ? n : v) + 'px').join(' '));
                onCommit();
              }}
            />
          </div>
        ))}
      </div>
    </PropertyField>
  );
}
