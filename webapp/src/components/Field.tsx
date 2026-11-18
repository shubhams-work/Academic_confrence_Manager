import type { ReactNode, Ref } from 'react';
import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { ChevronDown } from 'lucide-react';

interface FieldProps {
  label?: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  /** Shows a red asterisk after the label. */
  required?: boolean;
  className?: string;
  children: ReactNode;
}

/** Label + control + hint/error wrapper. */
export function Field({ label, hint, error, required = false, className = '', children }: FieldProps): React.JSX.Element {
  return (
    <label className={`block ${className}`}>
      {label != null && (
        <span className="mb-1 block text-sm font-medium text-ink">
          {label}
          {required && <span className="ml-0.5 text-red-600 dark:text-red-400">*</span>}
        </span>
      )}
      {children}
      {error != null ? (
        <span className="mt-1 block text-xs text-red-600 dark:text-red-400">{error}</span>
      ) : hint != null ? (
        <span className="mt-1 block text-xs text-ink-muted">{hint}</span>
      ) : null}
    </label>
  );
}

const controlCls =
  'w-full rounded-lg border border-line bg-surface px-3 text-base text-ink placeholder:text-ink-muted/70 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-60';

// Inputs are ≥16px to avoid iOS zoom-on-focus.
export function Input({
  className = '',
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { ref?: Ref<HTMLInputElement> }): React.JSX.Element {
  return <input className={`${controlCls} h-11 ${className}`} {...rest} />;
}

export function Select({
  className = '',
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & { ref?: Ref<HTMLSelectElement> }): React.JSX.Element {
  // appearance-none drops the OS arrow so we can render a consistent chevron;
  // pr-10 keeps long option text from sliding under it, truncate clips it.
  return (
    <span className="relative block">
      <select
        className={`${controlCls} h-11 appearance-none truncate pr-10 ${className}`}
        {...rest}
      />
      <ChevronDown
        size={18}
        aria-hidden
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted"
      />
    </span>
  );
}

export function Textarea({
  className = '',
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { ref?: Ref<HTMLTextAreaElement> }): React.JSX.Element {
  return <textarea className={`${controlCls} min-h-24 py-2.5 ${className}`} {...rest} />;
}
