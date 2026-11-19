import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  /** Wider dialog on desktop (for tables etc.). */
  wide?: boolean;
  /** Sticky action bar (e.g. Cancel / Save) pinned to the bottom. */
  footer?: ReactNode;
  /**
   * Ignore taps on the backdrop. Use for forms: dismissing a native date or
   * time picker registers as an outside tap, which would otherwise close the
   * sheet and throw away whatever had been filled in.
   */
  persistent?: boolean;
}

/**
 * Full-screen sheet on phones, centered modal on desktop.
 * Use for forms and dialogs.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  wide = false,
  footer,
  persistent = false,
}: SheetProps): React.JSX.Element | null {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-center md:items-center md:p-6">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={persistent ? undefined : onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        className={`relative flex h-full w-full flex-col bg-surface shadow-2xl md:h-auto md:max-h-[85vh] md:max-w-lg md:rounded-2xl md:border md:border-line ${
          wide ? 'md:max-w-3xl' : ''
        }`}
      >
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-line px-4">
          <h2 className="truncate text-base font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-2 flex h-11 w-11 items-center justify-center rounded-lg text-ink-muted hover:bg-muted"
          >
            <X size={20} aria-hidden />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
        {footer != null && (
          <div className="flex shrink-0 justify-end gap-2 border-t border-line px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

/** Alias for readability at desktop-only call sites. */
export { Sheet as Modal };
