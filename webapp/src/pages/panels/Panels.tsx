// Panels list (Chair + Session Incharge): track filter, one card per panel
// with members' sign-up status and scoring progress. "New panel" creates a
// panel and opens its detail page. Port of ../lib/features/panels/panels_page.dart.

import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { CheckCircle2, ChevronRight, Clock, Lock, MapPin, Plus, UserCog, Users } from 'lucide-react';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Chip } from '../../components/Chip';
import { EmptyState } from '../../components/EmptyState';
import { ListSkeleton, QueryError } from '../../components/QueryError';
import { TrackTabs } from '../../components/TrackTabs';
import { friendlyError } from '../../lib/api';
import { usePanels, useTracks } from '../../lib/queries';
import type { Panel, Track } from '../../lib/types';
import PanelForm from './PanelForm';
import { panelProgress, venueLine } from './parts/util';

export default function Panels(): React.JSX.Element {
  const navigate = useNavigate();
  const tracks = useTracks();
  const panels = usePanels(null);
  const [trackId, setTrackId] = useState<number | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const trackList = tracks.data ?? [];
  const trackById = useMemo(() => new Map(trackList.map((t) => [t.id, t])), [trackList]);
  const all = panels.data ?? [];
  const list = useMemo(
    () =>
      all
        .filter((p) => trackId == null || p.trackId === trackId)
        .sort(
          (a, b) =>
            (trackById.get(a.trackId)?.sortOrder ?? a.trackId) - (trackById.get(b.trackId)?.sortOrder ?? b.trackId) ||
            a.name.localeCompare(b.name),
        ),
    [all, trackId, trackById],
  );

  if (tracks.isError || panels.isError) {
    return (
      <QueryError
        message={friendlyError(tracks.error ?? panels.error)}
        onRetry={() => {
          void tracks.refetch();
          void panels.refetch();
        }}
      />
    );
  }

  const allFinalized = trackList.length > 0 && trackList.every((t) => t.finalizedAt != null);

  return (
    <div>
      <TrackTabs tracks={trackList} selected={trackId} onChange={setTrackId} />

      <div className="mb-3 mt-2 flex items-center justify-between gap-2">
        <p className="text-sm text-ink-muted">
          {panels.data != null ? `${list.length} panel${list.length === 1 ? '' : 's'}` : ''}
        </p>
        <Button className="hidden md:inline-flex" onClick={() => setFormOpen(true)} disabled={allFinalized}>
          <Plus size={16} aria-hidden />
          New panel
        </Button>
      </div>

      {tracks.isLoading || panels.isLoading ? (
        <ListSkeleton count={4} height="h-36" />
      ) : list.length === 0 ? (
        <EmptyState
          icon={Users}
          message={
            all.length === 0
              ? 'No panels yet. Create a panel of two members, then assign papers to it.'
              : 'No panels in this track yet.'
          }
          action={
            <Button onClick={() => setFormOpen(true)} disabled={allFinalized}>
              <Plus size={16} aria-hidden />
              New panel
            </Button>
          }
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {list.map((p) => (
            <PanelCard key={p.id} panel={p} track={trackById.get(p.trackId)} onOpen={() => navigate(`/panels/${p.id}`)} />
          ))}
        </div>
      )}

      {/* Floating add button on phones (above the bottom tab bar). */}
      <button
        type="button"
        onClick={() => setFormOpen(true)}
        disabled={allFinalized}
        aria-label="New panel"
        className="fixed bottom-20 right-4 z-30 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-fg shadow-lg active:bg-primary disabled:opacity-50 md:hidden"
      >
        <Plus size={26} aria-hidden />
      </button>

      <PanelForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        defaultTrackId={trackId != null && trackById.get(trackId)?.finalizedAt == null ? trackId : null}
        onSaved={(id) => navigate(`/panels/${id}`)}
      />
    </div>
  );
}

function PanelCard({ panel, track, onOpen }: { panel: Panel; track: Track | undefined; onOpen: () => void }): React.JSX.Element {
  const { done, expected } = panelProgress(panel);
  const pct = expected === 0 ? 0 : Math.round((done / expected) * 100);
  const where = venueLine(panel.venue, panel.scheduledAt);
  const members = [...panel.members].sort((a, b) => a.position - b.position);

  return (
    <Card onClick={onOpen}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{panel.name}</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            <Chip tone="indigo" icon={track?.finalizedAt != null ? Lock : undefined}>
              {track?.name ?? `Track ${panel.trackId}`}
            </Chip>
          </div>
          {where !== '' && (
            <p className="mt-1.5 flex items-center gap-1 truncate text-sm text-ink-muted">
              <MapPin size={14} className="shrink-0" aria-hidden />
              {where}
            </p>
          )}
          {panel.createdByName != null && panel.createdByName !== '' && (
            <p className="mt-1 flex items-center gap-1 truncate text-xs text-ink-muted">
              <UserCog size={13} className="shrink-0" aria-hidden />
              Created by {panel.createdByName}
            </p>
          )}
        </div>
        <ChevronRight size={18} className="mt-0.5 shrink-0 text-ink-muted" aria-hidden />
      </div>

      <ul className="mt-3 space-y-1">
        {members.map((m) => (
          <li key={m.id} className="flex items-center gap-1.5 text-sm">
            {m.profileId != null ? (
              <CheckCircle2 size={15} className="shrink-0 text-green-600 dark:text-green-400" aria-label="Signed up" />
            ) : (
              <Clock size={15} className="shrink-0 text-amber-600 dark:text-amber-400" aria-label="Not signed up yet" />
            )}
            <span className="truncate">{m.name}</span>
          </li>
        ))}
      </ul>

      <div className="mt-3">
        <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
          <div
            className={`h-full rounded-full ${pct === 100 ? 'bg-green-600' : 'bg-primary'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="mt-1.5 text-xs text-ink-muted">
          {panel.papers.length} paper{panel.papers.length === 1 ? '' : 's'} · {done}/{expected} scored
        </p>
      </div>
    </Card>
  );
}
