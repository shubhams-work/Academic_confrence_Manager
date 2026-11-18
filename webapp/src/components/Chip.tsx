import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

export type ChipTone = 'gray' | 'indigo' | 'gold' | 'green' | 'amber' | 'orange' | 'red' | 'blue';

const tones: Record<ChipTone, string> = {
  gray: 'border-slate-300 bg-slate-100 text-slate-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300',
  /* Legacy "indigo" tone is remapped to the COSMIC gold accent. */
  indigo:
    'border-yellow-400/50 bg-yellow-400/10 text-yellow-800 dark:border-yellow-400/40 dark:bg-yellow-400/10 dark:text-yellow-300',
  gold:
    'border-yellow-400/60 bg-yellow-400/15 text-yellow-800 dark:border-yellow-400/40 dark:bg-yellow-400/10 dark:text-yellow-300',
  green: 'border-green-300 bg-green-50 text-green-700 dark:border-green-500/50 dark:bg-green-500/15 dark:text-green-300',
  amber: 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-500/50 dark:bg-amber-500/15 dark:text-amber-300',
  orange: 'border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-500/50 dark:bg-orange-500/15 dark:text-orange-300',
  red: 'border-red-300 bg-red-50 text-red-700 dark:border-red-500/50 dark:bg-red-500/15 dark:text-red-300',
  blue: 'border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-500/50 dark:bg-sky-500/15 dark:text-sky-300',
};

interface ChipProps {
  tone?: ChipTone;
  icon?: LucideIcon;
  children: ReactNode;
  className?: string;
}

/** Small coloured label, e.g. "Submitted", "Draft", "Finalized". */
export function Chip({ tone = 'gray', icon: Icon, children, className = '' }: ChipProps): React.JSX.Element {
  return (
    <span
      className={`inline-flex max-w-full items-center gap-1 truncate rounded-full border px-2 py-0.5 text-xs font-semibold ${tones[tone]} ${className}`}
    >
      {Icon ? <Icon size={12} aria-hidden /> : null}
      {children}
    </span>
  );
}
