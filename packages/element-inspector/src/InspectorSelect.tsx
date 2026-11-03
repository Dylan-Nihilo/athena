import { HugeiconsIcon } from '@hugeicons/react';
import { ArrowDown01Icon, Tick02Icon } from '@hugeicons-pro/core-stroke-rounded';
import type { ReactNode } from 'react';
import { Button, ListBox, ListBoxItem, Popover, Select, SelectValue } from 'react-aria-components';

export interface InspectorOption {
  value: string;
  label: string;
  preview?: ReactNode;
}

export function BorderStyleSample({ value }: { value: string }) {
  return <span className="ei-border-sample" data-style={value} aria-hidden />;
}

export function InspectorSelect({
  id,
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  id?: string;
  label: string;
  value: string;
  options: InspectorOption[];
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const selected = options.find((option) => option.value === value);
  const items = selected || !value ? options : [{ value, label: value }, ...options];
  return (
    <Select
      className="ei-select"
      aria-label={label}
      value={value || null}
      isDisabled={disabled}
      onChange={(key) => {
        if (key !== null) onChange(String(key));
      }}
    >
      <Button id={id} className="ei-select-trigger" data-choice-label={label}>
        {selected?.preview}
        <SelectValue className="ei-select-value">
          {({ selectedText }) => selectedText || '当前值'}
        </SelectValue>
        <HugeiconsIcon icon={ArrowDown01Icon} className="ei-select-chevron" size={13} aria-hidden />
      </Button>
      <Popover className="ei-select-popup" placement="bottom start" offset={4}>
        <ListBox items={items} className="ei-select-list">
          {(option) => (
            <ListBoxItem id={option.value} textValue={option.label} className="ei-option">
              {({ isSelected }) => (
                <>
                  {option.preview}
                  <span className="ei-option-label">{option.label}</span>
                  {isSelected && (
                    <HugeiconsIcon
                      icon={Tick02Icon}
                      className="ei-option-check"
                      size={14}
                      aria-hidden
                    />
                  )}
                </>
              )}
            </ListBoxItem>
          )}
        </ListBox>
      </Popover>
    </Select>
  );
}
