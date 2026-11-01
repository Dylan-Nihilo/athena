import { useEffect, useId, useState } from 'react';

export function NumericEntry({
  id,
  label,
  value,
  min,
  max,
  step,
  unit,
  placeholder,
  hint,
  disabled,
  onSubmit,
}: {
  id?: string;
  label: string;
  value?: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  placeholder?: string;
  hint?: string;
  disabled?: boolean;
  onSubmit: (value: number) => void;
}) {
  const errorId = useId();
  const [draft, setDraft] = useState<string>();
  const [invalid, setInvalid] = useState(false);
  const reset = () => {
    setDraft(undefined);
    setInvalid(false);
  };
  useEffect(() => {
    reset();
  }, [value]);
  const submit = () => {
    if (draft === undefined) return;
    const n = Number(draft);
    if (!draft.trim() || !Number.isFinite(n) || n < min || n > max) {
      setInvalid(true);
      return;
    }
    reset();
    if (n !== value) onSubmit(n);
  };
  return (
    <>
      <div className="ei-number-box" title={hint}>
        <input
          id={id}
          type="number"
          aria-label={label}
          min={min}
          max={max}
          step={step}
          value={draft ?? value ?? ''}
          disabled={disabled}
          placeholder={placeholder}
          style={{ width: Math.max(3, Math.min(8, String(draft ?? value ?? '').length)) + 'ch' }}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? errorId : undefined}
          onChange={(e) => {
            setDraft(e.target.value);
            setInvalid(false);
          }}
          onBlur={submit}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              reset();
            }
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
        />
        {unit && <span aria-hidden>{unit}</span>}
      </div>
      {invalid && (
        <small id={errorId} className="ei-error" role="status">
          请输入 {min}–{max}
          {unit} 之间的数值
        </small>
      )}
    </>
  );
}
