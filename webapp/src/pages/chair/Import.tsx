import { useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { CloudUpload, Download, FolderOpen, ClipboardCheck, Save } from 'lucide-react';
import { useImportReviewScores, usePapers, useTracks } from '../../lib/queries';
import { friendlyError } from '../../lib/api';
import { parseReviewScores, ReviewScoreDraft, type ReviewImportResult } from '../../lib/importParse';
import {
  readSheetRows,
  reviewScoresTemplate,
  reviewScoresTemplateFromPapers,
} from '../../lib/excel';
import { fmtScore } from '../../lib/scoring';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Chip } from '../../components/Chip';
import { Field, Input, Select } from '../../components/Field';
import { Sheet } from '../../components/Sheet';
import { useToast } from '../../components/Toast';
import { IssuesList } from './parts/IssuesList';
import { QueryError } from './parts/QueryError';

const MAX_REVIEW_SCORE = 50;

/** Chair: upload review scores from Excel, or type one in by hand.
 *  Bulk-uploading papers themselves lives under Papers -> Add paper
 *  (see PaperImport.tsx). The Excel libraries are only loaded when a file is
 *  picked or a template downloaded (see lib/excel.ts). */
export default function Import() {
  const toast = useToast();
  const tracks = useTracks();
  const allPapers = usePapers(null);
  const importReviews = useImportReviewScores();

  const reviewsInput = useRef<HTMLInputElement>(null);

  const [reviewFile, setReviewFile] = useState<string | null>(null);
  const [reviewResult, setReviewResult] = useState<ReviewImportResult | null>(null);
  const [parsingReviews, setParsingReviews] = useState(false);
  const [unknownIds, setUnknownIds] = useState<{ updated: number; unknown: string[] } | null>(null);

  // Manual single review-score entry.
  const [manualPid, setManualPid] = useState('');
  const [manualScore, setManualScore] = useState('');
  const [manualErrors, setManualErrors] = useState<{ pid?: string; score?: string }>({});

  const sortedPapers = useMemo(
    () => [...(allPapers.data ?? [])].sort((a, b) => a.pid.localeCompare(b.pid)),
    [allPapers.data],
  );
  const selectedPaper = sortedPapers.find((p) => p.pid === manualPid) ?? null;

  const trackList = useMemo(
    () => [...(tracks.data ?? [])].sort((a, b) => a.sortOrder - b.sortOrder),
    [tracks.data],
  );

  const busy = importReviews.isPending || parsingReviews;

  const clearReviews = () => {
    setReviewResult(null);
    setReviewFile(null);
    if (reviewsInput.current != null) reviewsInput.current.value = '';
  };

  const download = async (make: () => Promise<void>) => {
    try {
      await make();
    } catch (e) {
      toast.error(friendlyError(e));
    }
  };

  const onReviewsFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file == null) return;
    setParsingReviews(true);
    try {
      const rows = await readSheetRows(file);
      setReviewFile(file.name);
      setReviewResult(parseReviewScores(rows));
    } catch (err) {
      toast.error(`Could not read the file: ${friendlyError(err)}`);
      clearReviews();
    } finally {
      setParsingReviews(false);
    }
  };

  const doImportReviews = () => {
    const res = reviewResult;
    if (res == null || res.scores.length === 0) return;
    importReviews.mutate(res.scores, {
      onSuccess: (out) => {
        clearReviews();
        if (out.unknown.length === 0) {
          toast.success(`Updated ${out.updated} review scores`);
        } else {
          setUnknownIds(out);
        }
      },
      onError: (e) => toast.error(friendlyError(e)),
    });
  };

  const saveManualReview = (e: FormEvent) => {
    e.preventDefault();
    const pid = manualPid.trim();
    const score = Number(manualScore);
    const errs: { pid?: string; score?: string } = {};
    if (pid === '') errs.pid = 'Select a paper';
    if (manualScore.trim() === '' || Number.isNaN(score)) errs.score = 'Enter a score';
    else if (score < 0 || score > MAX_REVIEW_SCORE) errs.score = `Must be 0–${MAX_REVIEW_SCORE}`;
    setManualErrors(errs);
    if (errs.pid != null || errs.score != null) return;

    importReviews.mutate([new ReviewScoreDraft(pid, score, 0)], {
      onSuccess: (out) => {
        if (out.unknown.length === 0) {
          toast.success(`Review score for ${pid} saved`);
          setManualPid('');
          setManualScore('');
          setManualErrors({});
        } else {
          toast.error(`${pid} was not found`);
        }
      },
      onError: (err) => toast.error(friendlyError(err)),
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

  return (
    <div className="max-w-3xl flex flex-col gap-4">
      <input
        ref={reviewsInput}
        type="file"
        accept=".xlsx"
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
        onChange={(e) => void onReviewsFile(e)}
      />

      {/* Review scores */}
      <Card className="p-4">
        <div className="flex items-center gap-2">
          <ClipboardCheck size={20} className="text-primary dark:text-primary shrink-0" />
          <h3 className="text-base font-semibold">Review scores (out of 50)</h3>
        </div>
        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
          Columns: Paper ID, Review Score (Title and Track are included for reference and ignored
          on upload). The template is pre-filled with every paper already in the system — fill
          only the Review Score column. Blank rows are silently skipped, so you can re-upload later
          with the remaining scores.
        </p>

        {/* Manual single-paper entry. */}
        <form className="mt-3 flex flex-col gap-3 rounded-lg border border-gray-200 dark:border-gray-800 p-3" onSubmit={saveManualReview}>
          <p className="text-xs font-medium text-ink">Add a score for one paper</p>
          <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
            <Field label="Paper" error={manualErrors.pid}>
              <Select
                value={manualPid}
                onChange={(e) => setManualPid(e.target.value)}
                disabled={busy || sortedPapers.length === 0}
              >
                <option value="">
                  {sortedPapers.length === 0 ? 'No papers yet' : 'Select a paper…'}
                </option>
                {sortedPapers.map((p) => (
                  <option key={p.id} value={p.pid} title={p.title}>
                    {p.pid}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={`Score / ${MAX_REVIEW_SCORE}`} error={manualErrors.score}>
              <Input
                type="number"
                min={0}
                max={MAX_REVIEW_SCORE}
                step={0.5}
                inputMode="decimal"
                value={manualScore}
                onChange={(e) => setManualScore(e.target.value)}
                disabled={busy}
                className="sm:w-28"
              />
            </Field>
            <Button type="submit" className="w-full sm:w-auto" loading={importReviews.isPending} disabled={busy}>
              <Save size={16} />
              Save score
            </Button>
          </div>
          {selectedPaper != null && (
            <div className="text-xs text-ink-muted">
              <p className="line-clamp-2 break-words font-medium text-ink">{selectedPaper.title}</p>
              <p className="mt-0.5">
                Current review score:{' '}
                {selectedPaper.reviewScore == null
                  ? '—'
                  : `${fmtScore(selectedPaper.reviewScore)}/${MAX_REVIEW_SCORE}`}
              </p>
            </div>
          )}
        </form>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            onClick={() =>
              void download(() =>
                allPapers.data != null && allPapers.data.length > 0 && trackList.length > 0
                  ? reviewScoresTemplateFromPapers(allPapers.data, trackList)
                  : reviewScoresTemplate(),
              )
            }
          >
            <Download size={16} />
            Template
          </Button>
          <Button
            variant="outline"
            onClick={() => reviewsInput.current?.click()}
            disabled={busy}
            loading={parsingReviews}
          >
            <FolderOpen size={16} />
            Choose .xlsx file
          </Button>
          {reviewFile && (
            <span className="text-xs text-gray-500 dark:text-gray-400 max-w-[180px] truncate">
              {reviewFile}
            </span>
          )}
        </div>

        {reviewResult != null && (
          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-800">
            <Chip tone="green">{reviewResult.scores.length} review scores ready</Chip>
            <IssuesList issues={reviewResult.issues} note="Rows with problems are skipped." />
            {reviewResult.scores.length > 0 && (
              <>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {reviewResult.scores.slice(0, 60).map((s) => (
                    <Chip key={s.pid} tone="gray">
                      {s.pid}: {fmtScore(s.score)}
                    </Chip>
                  ))}
                  {reviewResult.scores.length > 60 && (
                    <Chip tone="gray">+{reviewResult.scores.length - 60} more</Chip>
                  )}
                </div>
                <div className="mt-3 flex flex-col sm:flex-row sm:justify-end">
                  <Button className="w-full sm:w-auto" onClick={doImportReviews} loading={importReviews.isPending} disabled={busy}>
                    <CloudUpload size={16} />
                    Upload {reviewResult.scores.length} review scores
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </Card>

      {/* Unknown Paper IDs after a review-score upload */}
      <Sheet
        open={unknownIds != null}
        onClose={() => setUnknownIds(null)}
        title={unknownIds ? `Updated ${unknownIds.updated} review scores` : ''}
        footer={
          <div className="flex justify-end">
            <Button onClick={() => setUnknownIds(null)}>OK</Button>
          </div>
        }
      >
        {unknownIds && (
          <div>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              These Paper IDs were not found and were skipped:
            </p>
            <p className="mt-2 text-sm font-medium text-red-600 dark:text-red-400 break-words">
              {unknownIds.unknown.join(', ')}
            </p>
          </div>
        )}
      </Sheet>
    </div>
  );
}
