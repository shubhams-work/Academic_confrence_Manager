import { RotateCw, TriangleAlert } from 'lucide-react';
import { Button } from './Button';

/** Error state for a failed query, with a retry button. */
export function QueryError({ message, onRetry }: { message: string; onRetry: () => void }): React.JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
      <TriangleAlert size={32} className="mb-3 text-red-500 dark:text-red-400" aria-hidden />
      <p className="text-sm font-medium text-ink">Something went wrong</p>
      <p className="mt-1 max-w-sm text-sm text-ink-muted">{message}</p>
      <Button variant="outline" className="mt-4" onClick={onRetry}>
        <RotateCw size={16} aria-hidden />
        Try again
      </Button>
    </div>
  );
}

/** Pulsing placeholder cards shown while a list loads. */
export function ListSkeleton({ count = 4, height = 'h-24' }: { count?: number; height?: string }): React.JSX.Element {
  return (
    <div className="flex flex-col gap-2" aria-label="Loading" role="status">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={`${height} animate-pulse rounded-xl bg-muted`} />
      ))}
    </div>
  );
}
