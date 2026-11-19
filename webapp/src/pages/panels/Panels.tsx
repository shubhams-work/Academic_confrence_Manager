// Panels list (Chair + Session Incharge): track filter, one card per panel
// with members' sign-up status and scoring progress. "New panel" creates a
// panel and opens its detail page. Port of ../lib/features/panels/panels_page.dart.

import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { CheckCircle2, ChevronRight, Clock, Lock, Mail, MapPin, Phone, Plus, Search, UserCog, Users } from 'lucide-react';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Chip } from '../../components/Chip';
import { EmptyState } from '../../components/EmptyState';
import { Input } from '../../components/Field';
import { ListSkeleton, QueryError } from '../../components/QueryError';
import { TrackTabs } from '../../components/TrackTabs';
import { friendlyError } from '../../lib/api';
import { usePanelists, usePanels, useTracks } from '../../lib/queries';
import type { Panel, PanelistSummary, Track } from '../../lib/types';
import PanelForm from './PanelForm';
import { panelProgress, venueLine } from './parts/util';

export default function Panels(): React.JSX.Element {
  const navigate = useNavigate();
  const tracks = useTracks();
  const panels = usePanels(null);
  const [trackId, setTrackId] = useState<number | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  // Sub-tab: the panels themselves, or every panelist's contact details.
  const [view, setView] = useState<'panels' | 'panelists'>('panels');
  const [query, setQuery] = useState('');

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

  // Panelists are listed independently of panel assignment, so this comes from
  // every panel-member account rather than from walking the panels.
  const panelistQuery = usePanelists();
  const panelists = useMemo(() => {
    const rows = panelistQuery.data ?? [];
    const q = query.trim().toLowerCase();
    if (q === '') return rows;
    return rows.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.email.toLowerCase().includes(q) ||
        (r.affiliation ?? '').toLowerCase().includes(q) ||
        r.panels.some((pp) => pp.name.toLowerCase().includes(q)),
    );
  }, [panelistQuery.data, query]);
  const idleCount = useMemo(
    () => (panelistQuery.data ?? []).filter((r) => r.panels.length === 0).length,
    [panelistQuery.data],
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
      {view === 'panels' && <TrackTabs tracks={trackList} selected={trackId} onChange={setTrackId} />}

      {/* Sub-tabs */}
      <div className="mt-1 flex gap-1 border-b border-line" role="tablist">
        {(['panels', 'panelists'] as const).map((v) => (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={view === v}
            onClick={() => setView(v)}
            className={`-mb-px min-h-11 border-b-2 px-3 text-sm font-medium transition-colors ${
              view === v
                ? 'border-primary text-ink'
                : 'border-transparent text-ink-muted hover:text-ink'
            }`}
          >
            {v === 'panels' ? 'Panels' : 'Panelists'}
          </button>
        ))}
      </div>

      <div className="mb-3 mt-2 flex items-center justify-between gap-2">
        <p className="text-sm text-ink-muted">
          {view === 'panels'
            ? panels.data == null
              ? ''
              : `${list.length} panel${list.length === 1 ? '' : 's'}`
            : panelistQuery.data == null
              ? ''
              : `${panelists.length} panelist${panelists.length === 1 ? '' : 's'}` +
                (idleCount > 0 ? ` · ${idleCount} idle` : '')}
        </p>
        <Button className="hidden md:inline-flex" onClick={() => setFormOpen(true)} disabled={allFinalized}>
          <Plus size={16} aria-hidden />
          New panel
        </Button>
      </div>

      {view === 'panelists' ? (
        panelistQuery.isLoading ? (
          <ListSkeleton count={5} height="h-20" />
        ) : panelistQuery.isError ? (
          <QueryError
            message={friendlyError(panelistQuery.error)}
            onRetry={() => void panelistQuery.refetch()}
          />
        ) : (
          <PanelistsView rows={panelists} query={query} onQuery={setQuery} />
        )
      ) : tracks.isLoading || panels.isLoading ? (
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

/** Every panelist, whether or not they sit on a panel. */
function PanelistsView({
  rows,
  query,
  onQuery,
}: {
  rows: PanelistSummary[];
  query: string;
  onQuery: (q: string) => void;
}): React.JSX.Element {
  return (
    <div>
      <div className="relative mb-3">
        <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
        <Input
          className="pl-10"
          placeholder="Search by name, email, affiliation or panel"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          aria-label="Search panelists"
          inputMode="search"
        />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={Users}
          message={
            query.trim() === ''
              ? 'No panelists yet. Create their accounts from the Panelists tab.'
              : 'No panelist matches that search.'
          }
        />
      ) : (
        <div className="grid gap-2 md:grid-cols-2">
          {rows.map((r) => (
            <Card key={r.email}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{r.name}</p>
                  {r.affiliation != null && r.affiliation !== '' && (
                    <p className="truncate text-sm text-ink-muted">{r.affiliation}</p>
                  )}
                </div>
                {r.signedUp ? (
                  <Chip tone="green" icon={CheckCircle2}>
                    Signed up
                  </Chip>
                ) : (
                  <Chip tone="amber" icon={Clock}>
                    Not signed up
                  </Chip>
                )}
              </div>

              <a
                href={`mailto:${r.email}`}
                className="mt-2 flex min-h-8 items-center gap-1.5 truncate text-sm text-primary"
              >
                <Mail size={14} className="shrink-0" aria-hidden />
                {r.email}
              </a>
              {r.phone != null && r.phone !== '' && (
                <a href={`tel:${r.phone}`} className="flex min-h-8 items-center gap-1.5 text-sm text-primary">
                  <Phone size={14} className="shrink-0" aria-hidden />
                  {r.phone}
                </a>
              )}

              <div className="mt-2 flex flex-wrap gap-1.5">
                {r.panels.length === 0 ? (
                  <Chip tone="gray">Idle — no panel</Chip>
                ) : (
                  r.panels.map((pp) => (
                    <Chip key={pp.id} tone="indigo">
                      {pp.name}
                    </Chip>
                  ))
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
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
