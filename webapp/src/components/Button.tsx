import { Spinner } from './Spinner';

type Variant = 'primary' | 'outline' | 'ghost' | 'danger';

const variants: Record<Variant, string> = {
  primary:
    'bg-primary text-primary-fg shadow-sm shadow-black/20 hover:brightness-105 active:brightness-95 focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-page',
  outline:
    'border border-primary/40 bg-surface text-ink hover:bg-primary/10 hover:border-primary/70',
  ghost: 'text-ink hover:bg-primary/10',
  danger: 'bg-red-600 text-white hover:bg-red-500 active:bg-red-700',
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'sm' | 'md';
  loading?: boolean;
}

/** Primary action button. Tap targets are at least 44px high (md). */
export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  type = 'button',
  className = '',
  children,
  disabled,
  ...rest
}: ButtonProps): React.JSX.Element {
  const sizeCls = size === 'sm' ? 'h-11 min-w-11 px-3 text-sm' : 'h-11 px-4 text-base';
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={`inline-flex select-none items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 ${sizeCls} ${variants[variant]} ${className}`}
      {...rest}
    >
      {loading ? <Spinner size={16} /> : null}
      {children}
    </button>
  );
}
