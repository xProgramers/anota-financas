import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';

const control =
  'h-11 w-full rounded-lg border border-line bg-surface px-3 text-[15px] text-ink placeholder:text-muted/70 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20 disabled:opacity-60';

interface FieldProps {
  label: string;
  hint?: ReactNode;
  error?: string | null;
}

export function TextField({ label, hint, error, className = '', ...rest }: FieldProps & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink">
        {label}
      </label>
      <input id={id} aria-invalid={Boolean(error)} aria-describedby={error || hint ? `${id}-d` : undefined} className={control} {...rest} />
      {(error || hint) && (
        <p id={`${id}-d`} className={`mt-1.5 text-sm ${error ? 'text-danger' : 'text-muted'}`}>
          {error ?? hint}
        </p>
      )}
    </div>
  );
}

export function SelectField({
  label,
  hint,
  error,
  className = '',
  children,
  ...rest
}: FieldProps & SelectHTMLAttributes<HTMLSelectElement>) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink">
        {label}
      </label>
      <select id={id} className={`${control} pr-8`} {...rest}>
        {children}
      </select>
      {(error || hint) && <p className={`mt-1.5 text-sm ${error ? 'text-danger' : 'text-muted'}`}>{error ?? hint}</p>}
    </div>
  );
}

export const inputClass = control;
