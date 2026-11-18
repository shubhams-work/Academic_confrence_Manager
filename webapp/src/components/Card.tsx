import type { ReactNode } from 'react';

interface CardProps {
  className?: string;
  children: ReactNode;
  /** Makes the whole card tappable (used for list items). */
  onClick?: () => void;
}

export function Card({ className = '', children, onClick }: CardProps): React.JSX.Element {
  const base = `rounded-xl border border-line bg-surface shadow-sm shadow-black/5 transition-colors ${className}`;
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`w-full p-4 text-left hover:border-primary/40 hover:bg-primary/5 active:bg-primary/10 ${base}`}
      >
        {children}
      </button>
    );
  }
  return <div className={`p-4 ${base}`}>{children}</div>;
}
