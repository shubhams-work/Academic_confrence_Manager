// Panels list (Chair + Session Incharge): track filter, one card per panel
// with members' sign-up status and scoring progress. "New panel" creates a
// panel and opens its detail page. Port of ../lib/features/panels/panels_page.dart.

import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import {
  CheckCircle2,
  ChevronRight,
  Clock,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  Mail,
  MapPin,
  Phone,
  Plus,
  Search,
  UserCog,
  UserPlus,
  Users,
} from 'lucide-react';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Chip } from '../../components/Chip';
import { EmptyState } from '../../components/EmptyState';
import { Input } from '../../components/Field';
import { ListSkeleton, QueryError } from '../../components/QueryError';
import { TrackTabs } from '../../components/TrackTabs';
import { friendlyError } from '../../lib/api';
import { useResetPanelistPassword, usePanelists, usePanels, useTracks } from '../../lib/queries';
import type { Panel, PanelistSummary, Track } from '../../lib/types';
import PanelForm from './PanelForm';
import { Sheet } from '../../components/Sheet';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { useToast } from '../../components/Toast';
import { AccountCreator } from './parts/AccountCreator';
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
  // Creating panelist accounts lives here, inside the Panelists sub-tab.
  const [addPanelistOpen, setAddPanelistOpen] = useState(false);

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
        {view === 'panels' ? (
          <Button className="hidden md:inline-flex" onClick={() => setFormOpen(true)} disabled={allFinalized}>
            <Plus size={16} aria-hidden />
            New panel
          </Button>
        ) : (
          <Button className="hidden md:inline-flex" onClick={() => setAddPanelistOpen(true)}>
            <UserPlus size={16} aria-hidden />
            Add panelist
          </Button>
        )}
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
        onClick={() => (view === 'panels' ? setFormOpen(true) : setAddPanelistOpen(true))}
        disabled={view === 'panels' && allFinalized}
        aria-label={view === 'panels' ? 'New panel' : 'Add panelist'}
        className="fixed bottom-20 right-4 z-30 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-fg shadow-lg active:bg-primary disabled:opacity-50 md:hidden"
      >
        {view === 'panels' ? <Plus size={26} aria-hidden /> : <UserPlus size={26} aria-hidden />}
      </button>

      {/* Create panelist accounts without leaving the Panelists sub-tab. */}
      <Sheet
        open={addPanelistOpen}
        onClose={() => setAddPanelistOpen(false)}
        title="Add panelists"
        wide
      >
        <AccountCreator role="panel_member" />
      </Sheet>

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
              ? 'No panelists yet. Use Add panelist to create their accounts.'
              : 'No panelist matches that search.'
          }
        />
      ) : (
        <div className="grid gap-2 md:grid-cols-2">
          {rows.map((r) => (
            <PanelistCard key={r.email} row={r} />
          ))}
        </div>
      )}
    </div>
  );
}

/** One panelist: contact details, their panels, and their sign-in password. */
function PanelistCard({ row }: { row: PanelistSummary }): React.JSX.Element {
  const toast = useToast();
  const reset = useResetPanelistPassword();
  const qc = useQueryClient();
  const [shown, setShown] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const password = row.password ?? null;

  const copy = async (value: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success('Password copied');
    } catch {
      toast.error('Could not copy — select the text instead.');
    }
  };

  const doReset = (): void => {
    reset.mutate(row.email, {
      onSuccess: (out) => {
        setConfirmReset(false);
        setShown(true);
        void qc.invalidateQueries({ queryKey: ['panelists'] });
        toast.success(`New password for ${out.email}: ${out.password}`);
      },
      onError: (e) => {
        setConfirmReset(false);
        toast.error(friendlyError(e));
      },
    });
  };

  return (
    <Card>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-semibold">{row.name}</p>
          {row.affiliation != null && row.affiliation !== '' && (
            <p className="truncate text-sm text-ink-muted">{row.affiliation}</p>
          )}
        </div>
        {row.signedUp ? (
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
        href={`mailto:${row.email}`}
        className="mt-2 flex min-h-8 items-center gap-1.5 truncate text-sm text-primary"
      >
        <Mail size={14} className="shrink-0" aria-hidden />
        {row.email}
      </a>
      {row.phone != null && row.phone !== '' && (
        <a href={`tel:${row.phone}`} className="flex min-h-8 items-center gap-1.5 text-sm text-primary">
          <Phone size={14} className="shrink-0" aria-hidden />
          {row.phone}
        </a>
      )}

      {/* Password last issued by the app. */}
      <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-line px-2 py-1.5">
        <KeyRound size={14} className="shrink-0 text-ink-muted" aria-hidden />
        {password == null ? (
          <span className="text-xs text-ink-muted">No password on record — reset to issue one</span>
        ) : (
          <>
            <span className="font-mono text-sm tabular-nums" aria-label="Password">
              {shown ? password : '••••••••••'}
            </span>
            <button
              type="button"
              onClick={() => setShown((v) => !v)}
              className="min-h-8 rounded px-1 text-ink-muted hover:text-ink"
              aria-label={shown ? 'Hide password' : 'Show password'}
            >
              {shown ? <EyeOff size={15} aria-hidden /> : <Eye size={15} aria-hidden />}
            </button>
            <button
              type="button"
              onClick={() => void copy(password)}
              className="min-h-8 rounded px-1 text-ink-muted hover:text-ink"
              aria-label="Copy password"
            >
              <Copy size={15} aria-hidden />
            </button>
          </>
        )}
        <Button
          variant="outline"
          size="sm"
          className="ml-auto"
          loading={reset.isPending}
          onClick={() => setConfirmReset(true)}
        >
          Reset
        </Button>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {row.panels.length === 0 ? (
          <Chip tone="gray">Idle — no panel</Chip>
        ) : (
          row.panels.map((pp) => (
            <Chip key={pp.id} tone="indigo">
              {pp.name}
            </Chip>
          ))
        )}
      </div>

      <ConfirmDialog
        open={confirmReset}
        title={`Reset the password for ${row.name}?`}
        message="A new password is generated and shown here. Their current password stops working immediately, so only do this if they need a new one."
        confirmLabel="Reset password"
        destructive
        busy={reset.isPending}
        onConfirm={doReset}
        onCancel={() => setConfirmReset(false)}
      />
    </Card>
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
