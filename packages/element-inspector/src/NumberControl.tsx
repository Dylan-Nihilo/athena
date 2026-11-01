import { Slider, SliderThumb, SliderTrack } from 'react-aria-components';
import { useId, type CSSProperties, type ReactNode } from 'react';
import { NumericEntry } from './NumericEntry';
import { ValueGlyph, type Measurement } from './ValueGlyph';
import { PropertyField } from './fields';

export interface NumberControlProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  action?: ReactNode;
  measurement?: Measurement;
  /** A shorthand or CSS keyword which cannot be represented by one number. */
  mixedValue?: string;
  disabled?: boolean;
  onChange: (value: number) => void;
  onCommit: () => void;
}

export function NumberControl({
  label,
  value,
  min,
  max,
  step,
  unit,
  action,
  measurement,
  mixedValue,
  disabled,
  onChange,
  onCommit,
}: NumberControlProps) {
  const id = useId();
  const steps = (max - min) / step;
  const showTicks =
    measurement === 'weight' && Number.isInteger(steps) && steps >= 2 && steps <= 16;
  return (
    <PropertyField label={label} htmlFor={id} action={action}>
      <div className="ei-number-row" data-measure={measurement}>
        {measurement && (
          <span className="ei-specimen">
            <ValueGlyph kind={measurement} value={value} fraction={(value - min) / (max - min)} />
          </span>
        )}
        <Slider
          aria-label={label + '滑块'}
          className="ei-slider"
          minValue={min}
          maxValue={max}
          step={step}
          isDisabled={disabled}
          value={Math.min(max, Math.max(min, value))}
          onChange={(n) => onChange(Number(n))}
          onChangeEnd={onCommit}
        >
          <SliderTrack className="ei-track">
            {({ state }) => (
              <>
                <span
                  className="ei-rail"
                  data-ticks={showTicks || undefined}
                  style={
                    showTicks
                      ? ({ '--ei-tick-spacing': 100 / steps + '%' } as CSSProperties)
                      : undefined
                  }
                >
                  <span style={{ width: `${state.getThumbPercent(0) * 100}%` }} />
                </span>
                <SliderThumb className="ei-thumb" />
              </>
            )}
          </SliderTrack>
        </Slider>
        <NumericEntry
          id={id}
          label={label + '数值'}
          min={min}
          max={max}
          step={step}
          value={mixedValue ? undefined : value}
          disabled={disabled}
          placeholder={mixedValue ? '混合' : undefined}
          hint={mixedValue}
          unit={unit}
          onSubmit={(n) => {
            onChange(n);
            onCommit();
          }}
        />
      </div>
      {mixedValue && <small className="ei-hint">{mixedValue}</small>}
    </PropertyField>
  );
}
