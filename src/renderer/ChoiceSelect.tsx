import { ListBox, Select } from '@heroui/react';

export interface ChoiceOption {
  value: string;
  label: string;
  disabled?: boolean;
}

/** One keyboard-accessible choice surface for toolbars, filters and settings. */
export function ChoiceSelect({
  label,
  value,
  onChange,
  options,
  isDisabled,
  className = '',
  triggerClassName = '',
  id,
  title,
  placeholder = '请选择',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: ChoiceOption[];
  isDisabled?: boolean;
  className?: string;
  triggerClassName?: string;
  id?: string;
  title?: string;
  placeholder?: string;
}) {
  return (
    <Select
      aria-label={label}
      aria-description={title}
      className={`choice-select ${className}`}
      value={value || null}
      placeholder={placeholder}
      isDisabled={isDisabled}
      disabledKeys={options.filter((option) => option.disabled).map((option) => option.value)}
      onChange={(next) => {
        if (typeof next === 'string') onChange(next);
      }}
    >
      <Select.Trigger
        id={id}
        data-choice-label={label}
        aria-label={label}
        className={`choice-select-trigger ${triggerClassName}`}
      >
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover className="choice-select-popover">
        <ListBox>
          {options.map((option) => (
            <ListBox.Item key={option.value} id={option.value} textValue={option.label}>
              <span>{option.label}</span>
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  );
}
