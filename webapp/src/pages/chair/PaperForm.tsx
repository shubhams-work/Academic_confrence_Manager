import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ArrowLeft, FileQuestion, Trash2 } from 'lucide-react';
import { useDeletePaper, usePapers, useSavePaper, useTracks } from '../../lib/queries';
import { parseReviewScore, type PaperDraftJson } from '../../lib/importParse';
import { friendlyError } from '../../lib/api';
import { fmtScore } from '../../lib/scoring';
import type { Track } from '../../lib/types';
import { useToast } from '../../components/Toast';
import { Button } from '../../components/Button';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { EmptyState } from '../../components/EmptyState';
import { Field, Input, Select } from '../../components/Field';
import { Spinner } from '../../components/Spinner';
import { AuthorEditor, newAuthorRow, type AuthorRow } from './parts/AuthorEditor';
import { QueryError } from './parts/QueryError';

const emailRe = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function trackSort(a: Track, b: Track): number {
  return a.sortOrder - b.sortOrder;
}

/** Add / edit a paper and its authors (port of PaperFormPage). Reached via
 *  /papers/new and /papers/:id/edit — see router.tsx. */
export default function PaperForm() {
  const { id } = useParams();
  const editing = id != null;
  const navigate = useNavigate();
  const toast = useToast();
  const tracks = useTracks();
  const papers = usePapers(null);
  const savePaper = useSavePaper();
  const deletePaper = useDeletePaper();

  const paper = useMemo(
    () => (editing ? (papers.data ?? []).find((p) => p.id === id) ?? null : null),
    [editing, papers.data, id],
  );

  // Form state (filled once the paper loads in edit mode).
  const [pid, setPid] = useState('');
  const [title, setTitle] = useState('');
  const [review, setReview] = useState('');
  const [trackId, setTrackId] = useState<number | null>(null);
  const [authors, setAuthors] = useState<AuthorRow[]>([newAuthorRow()]);
  const [ready, setReady] = useState(!editing);
  const [pidError, setPidError] = useState<string | null>(null);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [emailErrors, setEmailErrors] = useState<(string | null)[]>([null]);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (ready || !editing || paper == null) return;
    setPid(paper.pid);
    setTitle(paper.title);
    setReview(paper.reviewScore == null ? '' : fmtScore(paper.reviewScore));
    setTrackId(paper.trackId);
    setAuthors(
      paper.authors.length > 0
        ? paper.authors.map((a) =>
            newAuthorRow({
              name: a.name,
              affiliation: a.affiliation ?? '',
              email: a.email ?? '',
              phone: a.phone ?? '',
            }),
          )
        : [newAuthorRow()],
    );
    setEmailErrors(paper.authors.length > 0 ? paper.authors.map(() => null) : [null]);
    setReady(true);
  }, [ready, editing, paper]);

  const trackList = useMemo(
    () => [...(tracks.data ?? [])].sort(trackSort),
    [tracks.data],
  );
  const selectedTrackId = trackId ?? trackList[0]?.id ?? null;
  const busy = savePaper.isPending || deletePaper.isPending;

  const goBack = () => navigate('/papers');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const pidTrim = pid.trim();
    const titleTrim = title.trim();
    const [reviewValue, reviewMsg] = parseReviewScore(review.trim());
    const errs = authors.map((a) =>
      a.email.trim() === '' || emailRe.test(a.email.trim()) ? null : 'Enter a valid email',
    );
    setPidError(pidTrim === '' ? 'Paper ID is required' : null);
    setTitleError(titleTrim === '' ? 'Title is required' : null);
    setReviewError(reviewMsg);
    setEmailErrors(errs);
    if (pidTrim === '' || titleTrim === '' || reviewMsg != null || errs.some((x) => x != null)) return;

    const track = trackList.find((t) => t.id === selectedTrackId);
    if (track == null) return; // tracks still loading

    const draft: PaperDraftJson = {
      pid: pidTrim,
      title: titleTrim,
      track: track.name,
      review_score: reviewValue,
      authors: authors
        .filter((a) => a.name.trim() !== '')
        .map((a) => ({
          name: a.name.trim(),
          affiliation: a.affiliation.trim(),
          email: a.email.trim().toLowerCase(),
          phone: a.phone.trim(),
        })),
    };

    savePaper.mutate(draft, {
      onSuccess: () => {
        toast.success('Paper saved');
        goBack();
      },
      onError: (e) => toast.error(friendlyError(e)),
    });
  };

  const onDeleteConfirmed = () => {
    if (paper == null) return;
    deletePaper.mutate(paper.id, {
      onSuccess: () => {
        toast.success('Paper deleted');
        goBack();
      },
      onError: (e) => toast.error(friendlyError(e)),
    });
  };

  if (tracks.isError) {
    return (
      <QueryError
        message={tracks.error instanceof Error ? tracks.error.message : 'Could not load tracks.'}
        onRetry={() => void tracks.refetch()}
      />
    );
  }

  if (editing && papers.isError) {
    return (
      <QueryError
        message={papers.error instanceof Error ? papers.error.message : 'Could not load the paper.'}
        onRetry={() => void papers.refetch()}
      />
    );
  }

  if (!ready) {
    if (papers.isLoading || papers.data == null) {
      return (
        <div className="flex items-center justify-center py-12">
          <Spinner size={32} />
        </div>
      );
    }
    return (
      <div>
        <div className="flex items-center gap-2 mb-4">
          <button
            type="button"
            onClick={goBack}
            aria-label="Back to papers"
            className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <ArrowLeft size={20} />
          </button>
          <h2 className="flex-1 text-lg font-semibold truncate">Edit paper</h2>
        </div>
        <EmptyState
          icon={FileQuestion}
          message="Paper not found. It may have been deleted, or the link is out of date."
        />
        <div className="flex justify-center">
          <Button variant="outline" onClick={goBack}>
            Back to papers
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Page header */}
      <div className="flex items-center gap-2 mb-4">
        <button
          type="button"
          onClick={goBack}
          aria-label="Back to papers"
          className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
        >
          <ArrowLeft size={20} />
        </button>
        <h2 className="flex-1 text-lg font-semibold truncate">
          {editing ? `Edit ${paper?.pid ?? pid}` : 'Add paper'}
        </h2>
        {editing && (
          <Button
            variant="ghost"
            className="text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950"
            aria-label="Delete paper"
            onClick={() => setConfirmDelete(true)}
            disabled={busy}
          >
            <Trash2 size={18} />
            <span className="hidden sm:inline">Delete</span>
          </Button>
        )}
      </div>

      <form className="max-w-2xl flex flex-col gap-4" onSubmit={submit} noValidate>
        <Field label="Paper ID" required error={pidError}>
          <Input
            value={pid}
            onChange={(e) => setPid(e.target.value)}
            disabled={editing}
            autoComplete="off"
            aria-label="Paper ID"
          />
        </Field>

        <Field label="Title" required error={titleError}>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoComplete="off"
            aria-label="Title"
          />
        </Field>

        <Field label="Track" required>
          <Select
            value={selectedTrackId ?? ''}
            onChange={(e) => setTrackId(Number(e.target.value))}
            aria-label="Track"
          >
            {trackList.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Review score (0–50)"
          error={reviewError}
          hint="Leave empty if not available yet"
        >
          <Input
            inputMode="decimal"
            value={review}
            onChange={(e) => setReview(e.target.value)}
            placeholder="e.g. 38 or 42.5"
            autoComplete="off"
            aria-label="Review score"
          />
        </Field>

        <AuthorEditor rows={authors} errors={emailErrors} onChange={setAuthors} />

        <Button type="submit" loading={savePaper.isPending} disabled={busy}>
          Save
        </Button>
      </form>

      <ConfirmDialog
        open={confirmDelete}
        title={`Delete ${paper?.pid ?? pid}?`}
        message="This removes the paper, its authors and any panel scores. This cannot be undone."
        confirmLabel="Delete"
        destructive
        busy={deletePaper.isPending}
        onConfirm={onDeleteConfirmed}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}
