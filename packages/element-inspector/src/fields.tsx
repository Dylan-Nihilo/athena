import { ChevronDown } from 'lucide-react';
import { useId, type ComponentProps, type ReactNode } from 'react';

export function PropertySection({
  label,
  icon,
  children,
}: {
  label: string;
  icon?: ReactNode;
  children: ReactNode;
}) {
  const heading = useId();
  return (
    <section className="ei-section" aria-labelledby={heading}>
      <h3 id={heading}>
        {icon}
        {label}
      </h3>
      <div className="ei-grid">{children}</div>
    </section>
  );
}

export function PropertyField({
  label,
  htmlFor,
  action,
  children,
}: {
  label: string;
  htmlFor?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="ei-field">
      <div className="ei-field-heading">
        {htmlFor ? (
          <label className="ei-label" htmlFor={htmlFor}>
            {label}
          </label>
        ) : (
          <span className="ei-label">{label}</span>
        )}
        {action}
      </div>
      {children}
    </div>
  );
}

export function InspectorInput(props: ComponentProps<'input'>) {
  return <input {...props} className={['ei-input', props.className].filter(Boolean).join(' ')} />;
}

export function InspectorTextarea(props: ComponentProps<'textarea'>) {
  return (
    <textarea {...props} className={['ei-textarea', props.className].filter(Boolean).join(' ')} />
  );
}

export function InspectorSelect({ children, ...props }: ComponentProps<'select'>) {
  return (
    <span className="ei-select">
      <select {...props}>{children}</select>
      <ChevronDown size={13} aria-hidden />
    </span>
  );
}
