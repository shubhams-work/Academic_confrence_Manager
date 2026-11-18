import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';

interface ToastEntry {
  id: number;
  message: string;
  error: boolean;
}

interface ToastOptions {
  error?: boolean;
}

type ToastFn = (message: string, opts?: ToastOptions) => void;

const ToastCtx = createContext<ToastFn | null>(null);

export interface ToastApi {
  toast: ToastFn;
  success: (message: string) => void;
  error: (message: string) => void;
}

/** `const t = useToast(); t.success('Saved'); t.error('Oops')` (or `t.toast(msg, { error })`). */
export function useToast(): ToastApi {
  const fn = useContext(ToastCtx);
  if (!fn) throw new Error('useToast must be used inside <ToastProvider>');
  return useMemo(
    () => ({ toast: fn, success: (m: string) => fn(m), error: (m: string) => fn(m, { error: true }) }),
    [fn],
  );
}

export function ToastProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const nextId = useRef(0);

  const toast = useCallback<ToastFn>((message, opts) => {
    const id = (nextId.current += 1);
    setToasts((list) => [...list, { id, message, error: opts?.error === true }]);
    window.setTimeout(() => {
      setToasts((list) => list.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  return (
    <ToastCtx.Provider value={toast}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto max-w-sm rounded-lg px-4 py-2.5 text-sm font-medium text-white shadow-lg ${
              t.error ? 'bg-red-600' : 'bg-slate-900 dark:bg-slate-700'
            }`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
