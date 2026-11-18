import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

interface EmptyStateProps {
  icon: LucideIcon;
  message: string;
  action?: ReactNode;
}

/** Loading-free list placeholder with a hint. */
export function EmptyState({ icon: Icon, message, action }: EmptyStateProps): React.JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center px-8 py-16 text-center">
      <Icon size={44} className="text-ink-muted" aria-hidden />
      <p className="mt-4 max-w-sm text-sm text-ink-muted">{message}</p>
      {action != null ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}
