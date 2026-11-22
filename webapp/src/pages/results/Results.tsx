// Track-wise results (Chair only). Open tracks show live scores
// from the `paper_scores` view; finalized tracks show the frozen
// `track_results` snapshot. Chair can finalize / reopen. Export to .xlsx.
// Port of ../lib/features/results/results_page.dart.

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Download, Lock, LockOpen, Radio, Trophy } from 'lucide-react';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Chip } from '../../components/Chip';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { EmptyState } from '../../components/EmptyState';
import { ListSkeleton, QueryError } from '../../components/QueryError';
import { TrackTabs } from '../../components/TrackTabs';
import { useToast } from '../../components/Toast';
import { friendlyError, getApi } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { qk, useFinalizeTrack, useReopenTrack, useTracks } from '../../lib/queries';
import { fmtScore } from '../../lib/scoring';
import { isReviewMissing, isScoringComplete, isUnassigned, type ScoreRow, type Track } from '../../lib/types';

const dateFmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });

function sortRows(rows: ScoreRow[]): ScoreRow[] {
  return [...rows].sort((a, b) => a.rank - b.rank || a.pid.localeCompare(b.pid));
}

/** Rows for one track: the snapshot when finalized, live scores otherwise. */
function fetchTrackRows(track: Track): Promise<ScoreRow[]> {
  return track.finalizedAt != null ? getApi().finalizedScores(track.id) : getApi().liveScores(track.id);
}

interface Summary {
  total: number;
  noPanel: number;
  incomplete: number;
  noReview: number;
}

function summarize(rows: ScoreRow[]): Summary {
  return {
    total: rows.length,
    noPanel: rows.filter(isUnassigned).length,
    incomplete: rows.filter((r) => !isUnassigned(r) && !isScoringComplete(r)).length,
    noReview: rows.filter(isReviewMissing).length,
  };
}

function warningLines(s: Summary): string[] {
  const out: string[] = [];
  if (s.noPanel > 0) out.push(`${s.noPanel} paper${s.noPanel === 1 ? '' : 's'} without a panel`);
  if (s.incomplete > 0) out.push(`${s.incomplete} with panel scoring incomplete`);
  if (s.noReview > 0) out.push(`${s.noReview} missing a review score`);
  return out;
}

export default function Results(): React.JSX.Element {
  const auth = useAuth();
  const isChair = auth.role === 'organizing_chair';
  const toast = useToast();
  const tracks = useTracks();
  const finalize = useFinalizeTrack();
  const reopen = useReopenTrack();

  const trackList = useMemo(() => [...(tracks.data ?? [])].sort((a, b) => a.sortOrder - b.sortOrder), [tracks.data]);
  const [trackId, setTrackId] = useState<number | null>(null);
  useEffect(() => {
    if (trackId == null && trackList.length > 0) setTrackId(trackList[0]!.id);
  }, [trackId, trackList]);
  const track = trackList.find((t) => t.id === trackId);
  const finalized = track?.finalizedAt != null;

  // Same query keys as lib/queries.ts so mutations invalidate them; only the
  // query that matches the track's state runs.
  const live = useQuery({
    queryKey: qk.liveScores(trackId),
    queryFn: () => getApi().liveScores(trackId ?? undefined),
    enabled: track != null && !finalized,
  });
  const frozen = useQuery({
    queryKey: qk.finalizedScores(trackId),
    queryFn: () => getApi().finalizedScores(trackId ?? undefined),
    enabled: track != null && finalized,
  });
  const scores = finalized ? frozen : live;
  const rows = useMemo(() => sortRows(scores.data ?? []), [scores.data]);
  const summary = summarize(rows);
  const warnings = warningLines(summary);

  const [confirm, setConfirm] = useState<'finalize' | 'reopen' | null>(null);
  const [exporting, setExporting] = useState<'track' | 'all' | null>(null);

  const exportTracks = async (which: 'track' | 'all'): Promise<void> => {
    setExporting(which);
    try {
      const list = which === 'all' ? trackList : track != null ? [track] : [];
      const byTrack = new Map<number, ScoreRow[]>();
      if (which === 'track' && track != null) {
        byTrack.set(track.id, rows);
      } else {
        const all = await Promise.all(list.map(async (t) => [t.id, sortRows(await fetchTrackRows(t))] as const));
        for (const [id, r] of all) byTrack.set(id, r);
      }
      const { resultsWorkbook } = await import('../../lib/excel');
      await resultsWorkbook(list, byTrack);
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setExporting(null);
    }
  };

  const runConfirm = (): void => {
    if (track == null || confirm == null) return;
    const m = confirm === 'finalize' ? finalize : reopen;
    m.mutate(track.id, {
      onSuccess: () => {
        toast.success(confirm === 'finalize' ? `${track.name} results finalized` : `${track.name} reopened`);
        setConfirm(null);
      },
      onError: (e) => {
        toast.error(friendlyError(e));
        setConfirm(null);
      },
    });
  };

  if (tracks.isError) {
    return <QueryError message={friendlyError(tracks.error)} onRetry={() => void tracks.refetch()} />;
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <TrackTabs tracks={trackList} selected={trackId} onChange={setTrackId} allowAll={false} />
        </div>
        <Button
          variant="outline"
          size="sm"
          className="shrink-0"
          onClick={() => void exportTracks('all')}
          loading={exporting === 'all'}
          disabled={exporting != null || trackList.length === 0}
          title="Export all tracks (.xlsx)"
        >
          <Download size={15} aria-hidden />
          <span className="hidden sm:inline">All tracks</span>
        </Button>
      </div>

      {tracks.isLoading || track == null ? (
        <div className="mt-3">
          <ListSkeleton count={4} height="h-20" />
        </div>
      ) : (
        <>
          {/* Status card */}
          <Card className="mt-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                {finalized ? (
                  <p className="flex items-center gap-1.5 font-semibold text-green-700 dark:text-green-400">
                    <Lock size={16} aria-hidden />
                    Finalized on {dateFmt.format(new Date(track.finalizedAt!))}
                  </p>
                ) : (
                  <p className="flex items-center gap-1.5 font-semibold text-primary dark:text-primary">
                    <Radio size={16} aria-hidden />
                    Live scores — not finalized
                  </p>
                )}
                <p className="mt-1 text-sm text-ink-muted">
                  Final (/100) = Presentation (average of submitted panel totals, /50) + Review (/50)
                </p>
                <p className="mt-0.5 text-xs text-ink-muted">
                  Tie-break: higher Review (/50), then Presentation (/50).
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void exportTracks('track')}
                  loading={exporting === 'track'}
                  disabled={exporting != null || rows.length === 0}
                >
                  <Download size={15} aria-hidden />
                  Export
                </Button>
                {isChair &&
                  (finalized ? (
                    <Button variant="outline" size="sm" onClick={() => setConfirm('reopen')}>
                      <LockOpen size={15} aria-hidden />
                      Reopen
                    </Button>
                  ) : (
                    <Button size="sm" onClick={() => setConfirm('finalize')} disabled={rows.length === 0 || scores.isLoading}>
                      <Lock size={15} aria-hidden />
                      Finalize track
                    </Button>
                  ))}
              </div>
            </div>
            {!scores.isLoading && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                <Chip tone="indigo">
                  {summary.total} paper{summary.total === 1 ? '' : 's'}
                </Chip>
                {warnings.length === 0 && summary.total > 0 ? (
                  <Chip tone="green" icon={CheckCircle2}>
                    All complete
                  </Chip>
                ) : (
                  <>
                    {summary.noPanel > 0 && <Chip tone="gray">{summary.noPanel} without panel</Chip>}
                    {summary.incomplete > 0 && (
                      <Chip tone="amber" icon={AlertTriangle}>
                        {summary.incomplete} scoring incomplete
                      </Chip>
                    )}
                    {summary.noReview > 0 && <Chip tone="orange">{summary.noReview} missing review</Chip>}
                  </>
                )}
              </div>
            )}
          </Card>

          {/* Rows */}
          <div className="mt-3">
            {scores.isLoading ? (
              <ListSkeleton count={5} height="h-20" />
            ) : scores.isError ? (
              <QueryError message={friendlyError(scores.error)} onRetry={() => void scores.refetch()} />
            ) : rows.length === 0 ? (
              <EmptyState icon={Trophy} message="No papers in this track yet." />
            ) : (
              <ResultsList rows={rows} />
            )}
          </div>
        </>
      )}

      <ConfirmDialog
        open={confirm != null}
        busy={finalize.isPending || reopen.isPending}
        onCancel={() => setConfirm(null)}
        onConfirm={runConfirm}
        destructive={false}
        title={confirm === 'finalize' ? `Finalize ${track?.name ?? ''} results?` : `Reopen ${track?.name ?? ''}?`}
        confirmLabel={confirm === 'finalize' ? 'Finalize' : 'Reopen'}
        message={
          confirm === 'finalize'
            ? (warnings.length > 0 ? `Warning: ${warnings.join('; ')}. ` : '') +
              'The current ranking is frozen, and scoring, panel and paper changes in this track are locked until you reopen it.'
            : 'The frozen results are discarded and the track goes back to live scores. Panels and scoring are unlocked.'
        }
      />
    </div>
  );
}

function statusText(r: ScoreRow): string {
  if (isUnassigned(r)) return 'No panel';
  return `${r.submittedCount}/${r.memberCount} scored`;
}

function StatusChips({ r }: { r: ScoreRow }): React.JSX.Element {
  return (
    <span className="flex flex-wrap gap-1">
      <Chip tone={isUnassigned(r) ? 'gray' : isScoringComplete(r) ? 'green' : 'amber'}>{statusText(r)}</Chip>
      {isReviewMissing(r) && <Chip tone="orange">No review</Chip>}
    </span>
  );
}

function RankBadge({ rank }: { rank: number }): React.JSX.Element {
  const tone =
    rank === 1
      ? 'bg-amber-400 text-amber-950'
      : rank === 2
        ? 'bg-slate-300 text-slate-900'
        : rank === 3
          ? 'bg-orange-300 text-orange-950'
          : 'bg-muted text-ink';
  return (
    <span className={`inline-flex h-8 min-w-8 items-center justify-center rounded-full px-2 text-sm font-bold ${tone}`}>{rank}</span>
  );
}

/** Cards on phones, a table on >= 768 px. */
function ResultsList({ rows }: { rows: ScoreRow[] }): React.JSX.Element {
  return (
    <>
      <div className="flex flex-col gap-2 md:hidden">
        {rows.map((r) => (
          <Card key={r.pid}>
            <div className="flex items-start gap-3">
              <RankBadge rank={r.rank} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold line-clamp-2 break-words">
                  <span className="text-primary">{r.pid}</span> · {r.title}
                </p>
                {r.panelName && <p className="truncate text-xs text-ink-muted">{r.panelName}</p>}
              </div>
              <div className="text-right">
                <p className="text-xl font-bold leading-none">{fmtScore(r.finalScore)}</p>
                <p className="text-xs text-ink-muted">/100</p>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="text-ink-muted">
                Presentation <span className="font-medium text-ink">{fmtScore(r.presentationScore)}</span> · Review{' '}
                <span className="font-medium text-ink">{fmtScore(r.reviewScore)}</span>
              </span>
              <StatusChips r={r} />
            </div>
          </Card>
        ))}
      </div>

      <Card className="hidden overflow-x-auto p-0! md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-muted">
              <th className="px-4 py-3 font-medium">Rank</th>
              <th className="px-4 py-3 font-medium">Paper ID</th>
              <th className="px-4 py-3 font-medium">Title</th>
              <th className="px-4 py-3 font-medium">Panel</th>
              <th className="px-4 py-3 text-right font-medium">Presentation /50</th>
              <th className="px-4 py-3 text-right font-medium">Review /50</th>
              <th className="px-4 py-3 text-right font-medium">Final /100</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.pid} className="border-b border-line last:border-0">
                <td className="px-4 py-2.5">
                  <RankBadge rank={r.rank} />
                </td>
                <td className="whitespace-nowrap px-4 py-2.5 font-medium">{r.pid}</td>
                <td className="px-4 py-2.5">{r.title}</td>
                <td className="px-4 py-2.5 text-ink-muted">{r.panelName ?? '—'}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{fmtScore(r.presentationScore)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{fmtScore(r.reviewScore)}</td>
                <td className="px-4 py-2.5 text-right text-base font-bold tabular-nums">{fmtScore(r.finalScore)}</td>
                <td className="px-4 py-2.5">
                  <StatusChips r={r} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
