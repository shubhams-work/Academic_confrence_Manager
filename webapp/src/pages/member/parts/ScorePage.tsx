import { useCallback, useEffect, useState } from 'react';
import { Link, useBlocker, useParams } from 'react-router';
import { AlertCircle, ArrowLeft, Lock, Save, SearchX, Send } from 'lucide-react';
import { Button } from '../../../components/Button';
import { Card } from '../../../components/Card';
import { Chip } from '../../../components/Chip';
import { ConfirmDialog } from '../../../components/ConfirmDialog';
import { EmptyState } from '../../../components/EmptyState';
import { Field, Textarea } from '../../../components/Field';
import { Spinner } from '../../../components/Spinner';
import { useToast } from '../../../components/Toast';
import { friendlyError } from '../../../lib/api';
import { useCriteria, useMyPapers, useSaveEvaluation, useTracks } from '../../../lib/queries';
import type { Criterion, Paper, Track } from '../../../lib/types';
import { CriterionControl } from './CriterionControl';

type Marks = Record<number, number | undefined>;
type SaveAction = 'draft' | 'submit' | null;

function currentSnapshot(criteria: Criterion[], marks: Marks, comments: string): string {
  return JSON.stringify({ marks: criteria.map((criterion) => marks[criterion.id] ?? null), comments });
}

function ScoreForm({ paper, criteria, track }: { paper: Paper; criteria: Criterion[]; track: Track | undefined }) {
  const existing = paper.evaluations[0];
  const saveEvaluation = useSaveEvaluation();
  const { toast } = useToast();
  const [marks, setMarks] = useState<Marks>(() => {
    const initial: Marks = {};
    for (const criterion of criteria) initial[criterion.id] = existing?.marks[criterion.id];
    return initial;
  });
  const [comments, setComments] = useState(existing?.comments ?? '');
  const [savedSnapshot, setSavedSnapshot] = useState(() => currentSnapshot(criteria, marks, comments));
  const [locallySubmitted, setLocallySubmitted] = useState(existing?.submitted === true);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [showRequired, setShowRequired] = useState(false);
  const [action, setAction] = useState<SaveAction>(null);

  const trackName = track?.name ?? 'Unknown track';
  const finalized = track?.finalizedAt != null;
  const submitted = locallySubmitted || existing?.submitted === true;
  const readOnly = finalized || submitted;
  const busy = action !== null || saveEvaluation.isPending;
  const total = criteria.reduce((sum, criterion) => sum + (marks[criterion.id] ?? 0), 0);
  const maxTotal = criteria.reduce((sum, criterion) => sum + criterion.maxMarks, 0);
  const complete = criteria.length > 0 && criteria.every((criterion) => marks[criterion.id] != null);
  const dirty = currentSnapshot(criteria, marks, comments) !== savedSnapshot;
  const blocker = useBlocker(dirty);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const setScore = useCallback(
    (criterionId: number, value: number) => {
      const criterion = criteria.find((item) => item.id === criterionId);
      if (criterion == null || readOnly || busy) return;
      const nextValue = Math.max(0, Math.min(criterion.maxMarks, Math.trunc(value)));
      setMarks((current) => {
        if (current[criterionId] === nextValue) return current;
        return { ...current, [criterionId]: nextValue };
      });
    },
    [busy, criteria, readOnly],
  );

  async function save(submit: boolean) {
    if (readOnly || busy) return;
    if (submit && !complete) {
      setShowRequired(true);
      toast('Please mark every criterion before submitting.', { error: true });
      return;
    }

    const snapshot = currentSnapshot(criteria, marks, comments);
    const codedMarks: Record<string, number> = {};
    for (const criterion of criteria) {
      const value = marks[criterion.id];
      if (value != null) codedMarks[criterion.code] = value;
    }

    setAction(submit ? 'submit' : 'draft');
    try {
      await saveEvaluation.mutateAsync({ paperId: paper.id, marks: codedMarks, comments, submit });
      setSavedSnapshot(snapshot);
      setShowRequired(false);
      if (submit) {
        setLocallySubmitted(true);
        setConfirmSubmit(false);
      }
      toast(submit ? 'Marks submitted' : 'Draft saved');
    } catch (error) {
      // Keep all values editable so the member can retry after an error.
      toast(friendlyError(error), { error: true });
    } finally {
      setAction(null);
    }
  }

  function askSubmit() {
    if (!complete) {
      setShowRequired(true);
      toast('Please mark every criterion before submitting.', { error: true });
      return;
    }
    setConfirmSubmit(true);
  }

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        to="/my-papers"
        className="mb-2 inline-flex min-h-11 items-center gap-1.5 rounded-lg px-1 text-sm font-medium text-primary hover:bg-primary/5 dark:text-primary dark:hover:bg-primary/10"
      >
        <ArrowLeft size={18} aria-hidden="true" />
        My papers
      </Link>

      <header className="mb-4">
        <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-primary dark:text-primary">
          <span>{paper.pid}</span>
          <Chip tone="indigo">
            {finalized && <Lock size={12} aria-label="Finalized track" />}
            {trackName}
          </Chip>
        </div>
        <h2 className="mt-2 text-xl font-bold leading-snug">{paper.title}</h2>
        <div className="mt-2 space-y-1">
          {paper.authors.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">Author details unavailable.</p>
          ) : (
            paper.authors.map((author, index) => (
              <p key={`${author.name}-${index}`} className="text-sm text-gray-600 dark:text-gray-400">
                <span className="font-medium text-gray-800 dark:text-gray-200">{author.name}</span>
                {author.affiliation?.trim() ? ` — ${author.affiliation}` : ''}
              </p>
            ))
          )}
        </div>
      </header>

      {readOnly && (
        <Card className="mb-4 flex gap-3 border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/40">
          <Lock className="mt-0.5 shrink-0 text-amber-700 dark:text-amber-300" size={20} aria-hidden="true" />
          <p className="text-sm text-amber-900 dark:text-amber-200">
            {submitted
              ? 'Submitted — ask the Organizing Chair to unlock this evaluation if a correction is needed.'
              : 'Results for this track are finalized. This evaluation is read-only.'}
          </p>
        </Card>
      )}

      {showRequired && (
        <p role="alert" className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700 dark:bg-red-950 dark:text-red-300">
          Please mark every criterion before submitting.
        </p>
      )}

      <div className="space-y-3">
        {criteria.map((criterion) => (
          <CriterionControl
            key={criterion.id}
            criterion={criterion}
            value={marks[criterion.id]}
            enabled={!readOnly && !busy}
            showRequired={showRequired}
            onChange={setScore}
          />
        ))}
      </div>

      <div className="mt-5">
        <Field label="Comments (optional)">
          <Textarea
            rows={4}
            value={comments}
            readOnly={readOnly}
            disabled={busy && !readOnly}
            onChange={(event) => setComments(event.target.value)}
            placeholder="Notes about this presentation"
          />
        </Field>
      </div>

      {/* bottom-14 keeps this bar above the 56px mobile tab nav; md: sits flush. */}
      <div className="sticky bottom-14 md:bottom-0 z-30 -mx-4 mt-6 border-t border-gray-200 bg-white/95 px-4 pt-3 shadow-[0_-4px_12px_rgba(0,0,0,0.05)] backdrop-blur dark:border-gray-800 dark:bg-gray-950/95">
        <div
          className="mx-auto flex max-w-3xl flex-wrap items-center gap-2"
          style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
        >
          <div className="shrink-0">
            <p className="text-xs text-gray-500 dark:text-gray-400">Total</p>
            <p className="text-xl font-bold tabular-nums">
              {total} <span className="text-sm font-medium">/ {maxTotal}</span>
            </p>
            {dirty && <p className="text-xs font-medium text-amber-700 dark:text-amber-300">Unsaved changes</p>}
          </div>
          {!readOnly && (
            <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
              <Button variant="outline" loading={action === 'draft'} disabled={busy} onClick={() => void save(false)}>
                <Save size={17} aria-hidden="true" />
                Save draft
              </Button>
              <Button loading={action === 'submit'} disabled={busy} onClick={askSubmit}>
                <Send size={17} aria-hidden="true" />
                Submit
              </Button>
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmSubmit}
        title={`Submit marks for ${paper.pid}?`}
        message={`Total: ${total} / ${maxTotal}.\n\nAfter submitting you cannot change these marks.`}
        confirmLabel="Submit"
        busy={busy}
        onConfirm={() => void save(true)}
        onCancel={() => {
          if (!busy) setConfirmSubmit(false);
        }}
      />
      <ConfirmDialog
        open={blocker.state === 'blocked'}
        title="Discard changes?"
        message="Your marks and comments have not been saved."
        confirmLabel="Discard"
        destructive
        onConfirm={() => blocker.proceed?.()}
        onCancel={() => blocker.reset?.()}
      />
    </div>
  );
}

export default function ScorePage() {
  const { paperId } = useParams();
  const papersQuery = useMyPapers();
  const criteriaQuery = useCriteria();
  const tracksQuery = useTracks();

  if (papersQuery.isPending || criteriaQuery.isPending || tracksQuery.isPending) {
    return (
      <div className="flex justify-center py-20" aria-label="Loading score form">
        <Spinner size={32} />
      </div>
    );
  }

  const error = papersQuery.error ?? criteriaQuery.error ?? tracksQuery.error;
  if (error != null) {
    const retrying = papersQuery.isFetching || criteriaQuery.isFetching || tracksQuery.isFetching;
    return (
      <Card className="mx-auto mt-8 max-w-md p-6 text-center">
        <AlertCircle className="mx-auto text-red-500" size={36} aria-hidden="true" />
        <p className="mt-3 text-sm text-gray-700 dark:text-gray-300">{friendlyError(error)}</p>
        <Button
          variant="outline"
          className="mt-4"
          loading={retrying}
          onClick={() => void Promise.all([papersQuery.refetch(), criteriaQuery.refetch(), tracksQuery.refetch()])}
        >
          Retry
        </Button>
      </Card>
    );
  }

  const paper = (papersQuery.data ?? []).find((item) => item.id === paperId);
  if (paper == null) {
    return (
      <EmptyState
        icon={SearchX}
        message="This paper is not assigned to you. Return to My papers to choose one of your assigned papers."
        action={
          <Link
            to="/my-papers"
            className="inline-flex min-h-11 items-center rounded-lg bg-primary px-4 font-medium text-primary-fg"
          >
            Back to My papers
          </Link>
        }
      />
    );
  }

  const criteria = criteriaQuery.data ?? [];
  if (criteria.length === 0) {
    return (
      <EmptyState
        icon={AlertCircle}
        message="Scoring criteria are unavailable. Please refresh or contact the organizers."
      />
    );
  }

  const track = (tracksQuery.data ?? []).find((item) => item.id === paper.trackId);
  const evaluation = paper.evaluations[0];
  return (
    <ScoreForm
      key={`${paper.id}-${evaluation?.submitted === true}`}
      paper={paper}
      criteria={criteria}
      track={track}
    />
  );
}
