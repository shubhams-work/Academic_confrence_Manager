import { Lock } from 'lucide-react';
import type { Track } from '../lib/types';

interface TrackTabsProps {
  tracks: Track[];
  /** null = "All" (only offered when allowAll). */
  selected: number | null;
  onChange: (id: number | null) => void;
  allowAll?: boolean;
}

/** Horizontal list of track choice chips; finalized tracks show a lock. */
export function TrackTabs({ tracks, selected, onChange, allowAll = true }: TrackTabsProps): React.JSX.Element {
  const item = (active: boolean): string =>
    `inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
      active
        ? 'border-primary bg-primary text-primary-fg'
        : 'border-line bg-surface text-ink hover:bg-muted'
    }`;
  return (
    <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 py-2">
      {allowAll && (
        <button type="button" className={item(selected === null)} onClick={() => onChange(null)}>
          All tracks
        </button>
      )}
      {tracks.map((t) => (
        <button key={t.id} type="button" className={item(selected === t.id)} onClick={() => onChange(t.id)}>
          {t.finalizedAt != null && <Lock size={13} aria-label="Finalized" />}
          {t.name}
        </button>
      ))}
    </div>
  );
}
