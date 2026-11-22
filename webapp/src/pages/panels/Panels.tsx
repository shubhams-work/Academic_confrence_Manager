// Panels list (Chair + Session Incharge): track filter, one card per panel
// with members' sign-up status and scoring progress. "New panel" creates a
// panel and opens its detail page. Port of ../lib/features/panels/panels_page.dart.

import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  CheckCircle2,
  ChevronRight,
  Clock,
  Copy,
  KeyRound,
  Lock,
  Mail,
  MapPin,
  Phone,
  Plus,
  Search,
  Trash2,
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
import { friendlyError, NeedsForceError } from '../../lib/api';
import {
  useDeletePanelist,
  usePanelistSigninLink,
  usePanelists,
  usePanels,
  useTracks,
} from '../../lib/queries';
import { useAuth } from '../../lib/auth';
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

/** One panelist: contact details, their panels, and their sign-in access. */
function PanelistCard({ row }: { row: PanelistSummary }): React.JSX.Element {
  const toast = useToast();
  const auth = useAuth();
  const signinLink = usePanelistSigninLink();
  const remove = useDeletePanelist();
  const [confirmResend, setConfirmResend] = useState(false);
  // null = closed. `force` is set after the server refuses a delete that would
  // erase submitted scores, so the second confirm states exactly what is lost.
  const [confirmDelete, setConfirmDelete] = useState<{ force: boolean; warning?: string } | null>(
    null,
  );

  // Deleting an account needs the service role, so it is Chair-only both here
  // and in the edge function.
  const isChair = auth.role === 'organizing_chair';

  const copy = async (value: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success('Sign-in link copied — send it to them directly');
    } catch {
      toast.error('Could not copy — try again.');
    }
  };

  /**
   * Copy mode returns the link only to the Chair; email mode sends it without
   * exposing it to this browser.
   */
  const issueLink = (mode: 'email' | 'copy'): void => {
    signinLink.mutate(
      { email: row.email, mode },
      {
        onSuccess: (out) => {
          if (mode === 'email') {
            setConfirmResend(false);
            toast.success(`Sign-in link emailed to ${out.email}`);
          } else {
            if (out.link == null) {
              toast.error('Could not issue a sign-in link.');
              return;
            }
            void copy(out.link);
          }
        },
        onError: (e) => {
          if (mode === 'email') setConfirmResend(false);
          toast.error(friendlyError(e));
        },
      },
    );
  };

  const doDelete = (force: boolean): void => {
    remove.mutate(
      { email: row.email, force },
      {
        onSuccess: (out) => {
          setConfirmDelete(null);
          const bits: string[] = [];
          if (out.deletedAccount) bits.push('account deleted');
          if (out.removedFromPanels > 0) {
            bits.push(`removed from ${out.removedFromPanels} panel${out.removedFromPanels === 1 ? '' : 's'}`);
          }
          if (out.deletedEvaluations > 0) {
            bits.push(`${out.deletedEvaluations} score sheet${out.deletedEvaluations === 1 ? '' : 's'} erased`);
          }
          toast.success(`${row.name}: ${bits.length === 0 ? 'deleted' : bits.join(', ')}`);
        },
        onError: (e) => {
          // The server refused because scores would be lost: ask again, louder.
          if (e instanceof NeedsForceError) {
            setConfirmDelete({ force: true, warning: e.message });
            return;
          }
          setConfirmDelete(null);
          toast.error(friendlyError(e));
        },
      },
    );
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

      {/*
        Panelists set their own password from an emailed link, so there is no
        password here to show. What staff need is a way to get them in when the
        email did not arrive: copy a one-time link, or send it again.
      */}
      <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-line px-2 py-1.5">
        <KeyRound size={14} className="shrink-0 text-ink-muted" aria-hidden />
        <span className="text-xs text-ink-muted">
          {row.signedUp
            ? 'Sets their own password — they can use Forgot password any time'
            : 'Invited, not signed in yet'}
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          {isChair && (
            <Button
              variant="outline"
              size="sm"
              loading={signinLink.isPending}
              onClick={() => issueLink('copy')}
            >
              <Copy size={15} aria-hidden />
              Copy link
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            loading={signinLink.isPending}
            onClick={() => setConfirmResend(true)}
          >
            Email link
          </Button>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {row.panels.length === 0 ? (
          <Chip tone="gray">Idle — no panel</Chip>
        ) : (
          row.panels.map((pp) => (
            <Chip key={pp.id} tone="indigo">
              {pp.name}
            </Chip>
          ))
        )}
        {isChair && (
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950"
            loading={remove.isPending}
            onClick={() => setConfirmDelete({ force: false })}
          >
            <Trash2 size={15} aria-hidden />
            Delete
          </Button>
        )}
      </div>

      <ConfirmDialog
        open={confirmResend}
        title={`Email a new sign-in link to ${row.name}?`}
        message={`Supabase emails ${row.email} a one-time link to set a password. Any link sent earlier stops working.`}
        confirmLabel="Send link"
        busy={signinLink.isPending}
        onConfirm={() => issueLink('email')}
        onCancel={() => setConfirmResend(false)}
      />

      <ConfirmDialog
        open={confirmDelete != null}
        title={
          confirmDelete?.force === true ? `Delete ${row.name} and their scores?` : `Delete ${row.name}?`
        }
        message={
          confirmDelete?.warning ??
          `This deletes their sign-in account and their seat on ${
            row.panels.length === 0
              ? 'any panel'
              : row.panels.map((pp) => pp.name).join(', ')
          }. It cannot be undone.${
            row.panels.length === 0 ? '' : ' The panel will be left short a member until you add someone.'
          }`
        }
        confirmLabel={confirmDelete?.force === true ? 'Delete anyway' : 'Delete panelist'}
        destructive
        busy={remove.isPending}
        onConfirm={() => doDelete(confirmDelete?.force === true)}
        onCancel={() => setConfirmDelete(null)}
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
