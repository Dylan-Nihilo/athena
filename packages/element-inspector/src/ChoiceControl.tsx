import { useId, type ReactNode } from 'react';
import { InspectorSelect, PropertyField } from './fields';

export interface ChoiceOption {
  value: string;
  label: string;
  icon?: ReactNode;
}

export function ChoiceControl({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  options: ChoiceOption[];
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const id = useId();
  const known = options.some((option) => option.value === value);
  if (options.length && options.every((option) => option.icon)) {
    return (
      <PropertyField label={label}>
        <div role="radiogroup" aria-label={label} className="ei-segments">
          {options.map((option) => (
            <label key={option.value} title={option.label}>
              <input
                type="radio"
                name={id}
                aria-label={option.label}
                value={option.value}
                checked={value === option.value}
                disabled={disabled}
                onChange={() => onChange(option.value)}
              />
              <span>{option.icon}</span>
            </label>
          ))}
        </div>
        {!known && value && <small className="ei-hint">当前值 {value}</small>}
      </PropertyField>
    );
  }
  return (
    <PropertyField label={label} htmlFor={id}>
      <InspectorSelect
        id={id}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      >
        {!known && <option value={value}>{value || '当前值'}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </InspectorSelect>
    </PropertyField>
  );
}
