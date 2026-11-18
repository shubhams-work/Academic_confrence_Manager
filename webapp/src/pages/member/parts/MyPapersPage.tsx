import { memo, useMemo, useState } from 'react';
import { Link } from 'react-router';
import {
  AlertCircle,
  Check,
  ChevronRight,
  Clock,
  Inbox,
  Lock,
  MapPin,
  RefreshCw,
  Search,
  SearchX,
} from 'lucide-react';
import { Button } from '../../../components/Button';
import { Card } from '../../../components/Card';
import { Chip } from '../../../components/Chip';
import { EmptyState } from '../../../components/EmptyState';
import { Input } from '../../../components/Field';
import { Spinner } from '../../../components/Spinner';
import { TrackTabs } from '../../../components/TrackTabs';
import { friendlyError } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { useMyPapers, useTracks } from '../../../lib/queries';
import { evalTotal, type Paper } from '../../../lib/types';
import { formatPanelDateTime } from './format';

interface PanelGroup {
  key: string;
  name: string;
  papers: Paper[];
}

function panelSummary(paper: Paper | undefined): string {
  if (paper == null) return '';
  const venue = paper.panelVenue?.trim() || null;
  const scheduledAt = formatPanelDateTime(paper.panelScheduledAt);
  return [venue, scheduledAt].filter((part) => part != null).join(' · ') || 'Venue and time to be announced';
}

const PaperCard = memo(function PaperCard({
  paper,
  trackName,
  finalized,
}: {
  paper: Paper;
  trackName: string;
  finalized: boolean;
}) {
  const evaluation = paper.evaluations[0];
  const total = evaluation == null ? null : evalTotal(evaluation);
  const submitted = evaluation?.submitted === true;
  const venue = paper.panelVenue?.trim() || 'Venue to be announced';
  const scheduledAt = formatPanelDateTime(paper.panelScheduledAt) ?? 'Time to be scheduled';

  return (
    <Link
      to={`/my-papers/${encodeURIComponent(paper.id)}`}
      aria-label={`Open scores for ${paper.pid}`}
      className="block rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 dark:focus:ring-offset-page"
    >
      <Card className="h-full p-4 transition-colors hover:border-primary dark:hover:border-primary">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold tracking-wide text-primary dark:text-primary">{paper.pid}</p>
            <h3 className="mt-1 font-semibold leading-snug line-clamp-2 break-words text-gray-900 dark:text-gray-100">{paper.title}</h3>
          </div>
          <ChevronRight className="mt-1 shrink-0 text-gray-400" size={20} aria-hidden="true" />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Chip tone="indigo">
            {finalized && <Lock size={12} aria-label="Finalized track" />}
            {trackName}
          </Chip>
          {evaluation == null ? (
            <Chip tone="blue">Not started</Chip>
          ) : submitted ? (
            <Chip tone="green">
              <Check size={13} aria-hidden="true" />
              Submitted
            </Chip>
          ) : (
            <Chip tone="orange">Draft</Chip>
          )}
        </div>

        <div className="mt-3 space-y-1.5 text-xs text-gray-500 dark:text-gray-400">
          <p className="flex items-center gap-1.5">
            <MapPin size={14} className="shrink-0" aria-hidden="true" />
            <span>{venue}</span>
          </p>
          <p className="flex items-center gap-1.5">
            <Clock size={14} className="shrink-0" aria-hidden="true" />
            <span>{scheduledAt}</span>
          </p>
        </div>

        <p className="mt-3 border-t border-gray-100 pt-3 text-sm text-gray-600 dark:border-gray-800 dark:text-gray-300">
          My total{' '}
          <span className="font-bold tabular-nums text-gray-900 dark:text-gray-100">
            {total ?? '—'} <span className="font-medium">/ 50</span>
          </span>
        </p>
      </Card>
    </Link>
  );
});

export default function MyPapersPage() {
  const auth = useAuth();
  const papersQuery = useMyPapers();
  const tracksQuery = useTracks();
  const [search, setSearch] = useState('');
  const [trackId, setTrackId] = useState<number | null>(null);

  const papers = papersQuery.data ?? [];
  const tracks = tracksQuery.data ?? [];
  const trackById = useMemo(() => new Map(tracks.map((track) => [track.id, track])), [tracks]);
  const done = papers.reduce((count, paper) => count + (paper.evaluations[0]?.submitted === true ? 1 : 0), 0);
  const fullName = auth.profile?.fullName.trim() ?? '';

  const visiblePapers = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    return papers.filter((paper) => {
      if (trackId != null && paper.trackId !== trackId) return false;
      if (needle === '') return true;
      const track = trackById.get(paper.trackId)?.name ?? '';
      const searchable = [
        paper.pid,
        paper.title,
        paper.panelName ?? '',
        track,
        ...paper.authors.map((author) => author.name),
      ]
        .join(' ')
        .toLocaleLowerCase();
      return searchable.includes(needle);
    });
  }, [papers, search, trackId, trackById]);

  const groups = useMemo(() => {
    const byPanel = new Map<string, PanelGroup>();
    for (const paper of visiblePapers) {
      const key = paper.panelId ?? paper.panelName ?? 'panel';
      const existing = byPanel.get(key);
      if (existing != null) {
        existing.papers.push(paper);
      } else {
        byPanel.set(key, { key, name: paper.panelName || 'Panel', papers: [paper] });
      }
    }
    return Array.from(byPanel.values());
  }, [visiblePapers]);

  const refresh = () => Promise.all([papersQuery.refetch(), tracksQuery.refetch()]);
  const error = papersQuery.error ?? tracksQuery.error;
  const refreshing = papersQuery.isFetching || tracksQuery.isFetching;

  if (papersQuery.isPending || tracksQuery.isPending) {
    return (
      <div className="flex justify-center py-20" aria-label="Loading your papers">
        <Spinner size={32} />
      </div>
    );
  }

  if (error != null) {
    return (
      <Card className="mx-auto mt-8 max-w-md p-6 text-center">
        <AlertCircle className="mx-auto text-red-500" size={36} aria-hidden="true" />
        <p className="mt-3 text-sm text-gray-700 dark:text-gray-300">{friendlyError(error)}</p>
        <Button variant="outline" className="mt-4" loading={refreshing} onClick={() => void refresh()}>
          <RefreshCw size={16} aria-hidden="true" />
          Retry
        </Button>
      </Card>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <Card className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold">{fullName === '' ? 'Welcome' : `Welcome, ${fullName}`}</h2>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              {done} of {papers.length} papers submitted
            </p>
          </div>
          <Button
            variant="outline"
            className="shrink-0 px-3"
            onClick={() => void refresh()}
            disabled={refreshing}
            aria-label="Refresh my papers"
          >
            <RefreshCw size={17} className={refreshing ? 'animate-spin' : ''} aria-hidden="true" />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
        </div>
        <div
          className="mt-4 h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800"
          role="progressbar"
          aria-label="Papers submitted"
          aria-valuemin={0}
          aria-valuemax={papers.length}
          aria-valuenow={done}
        >
          <div
            className="h-full rounded-full bg-primary"
            style={{ width: papers.length === 0 ? '0%' : `${(done / papers.length) * 100}%` }}
          />
        </div>
      </Card>

      {papers.length === 0 ? (
        <EmptyState icon={Inbox} message="No papers are assigned to your panel yet. Tap refresh to check again later." />
      ) : (
        <>
          <div className="relative mt-4">
            <label htmlFor="paper-search" className="sr-only">
              Search my papers
            </label>
            <Search
              size={19}
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            />
            <Input
              id="paper-search"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search ID, title or author"
              autoComplete="off"
              className="pl-10"
            />
          </div>

          <div className="mt-3 [&_button]:min-h-11">
            <TrackTabs tracks={tracks} selected={trackId} onChange={setTrackId} />
          </div>

          {groups.length === 0 ? (
            <EmptyState icon={SearchX} message="No papers match your filters. Try another search or select All tracks." />
          ) : (
            <div className="mt-2 space-y-6">
              {groups.map((group) => (
                <section key={group.key} aria-labelledby={`panel-${group.key}`}>
                  <div className="mb-2 px-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <h2 id={`panel-${group.key}`} className="font-semibold text-gray-900 dark:text-gray-100">
                        {group.name}
                      </h2>
                      <span className="shrink-0 text-xs text-gray-500 dark:text-gray-400">
                        {group.papers.length} {group.papers.length === 1 ? 'paper' : 'papers'}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{panelSummary(group.papers[0])}</p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {group.papers.map((paper) => (
                      <PaperCard
                        key={paper.id}
                        paper={paper}
                        trackName={trackById.get(paper.trackId)?.name ?? 'Unknown track'}
                        finalized={trackById.get(paper.trackId)?.finalizedAt != null}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
