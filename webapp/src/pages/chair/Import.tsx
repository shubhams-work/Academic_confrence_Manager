import { useMemo, useRef, useState, type ChangeEvent } from 'react';
import { CloudUpload, Download, FileSpreadsheet, FolderOpen, ClipboardCheck } from 'lucide-react';
import { useImportPapers, useImportReviewScores, usePapers, useTracks } from '../../lib/queries';
import { friendlyError } from '../../lib/api';
import {
  parsePapers,
  parseReviewScores,
  type PaperImportResult,
  type ReviewImportResult,
} from '../../lib/importParse';
import {
  papersTemplate,
  readSheetRows,
  reviewScoresTemplate,
  reviewScoresTemplateFromPapers,
} from '../../lib/excel';
import { fmtScore } from '../../lib/scoring';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Chip } from '../../components/Chip';
import { Sheet } from '../../components/Sheet';
import { useToast } from '../../components/Toast';
import { IssuesList } from './parts/IssuesList';
import { QueryError } from './parts/QueryError';

/** Chair: upload papers/authors and review scores from Excel
 *  (port of import_page.dart). The Excel libraries are only loaded when a
 *  file is picked or a template downloaded (see lib/excel.ts). */
export default function Import() {
  const toast = useToast();
  const tracks = useTracks();
  const allPapers = usePapers(null);
  const importPapers = useImportPapers();
  const importReviews = useImportReviewScores();

  const papersInput = useRef<HTMLInputElement>(null);
  const reviewsInput = useRef<HTMLInputElement>(null);

  const [papersFile, setPapersFile] = useState<string | null>(null);
  const [papersResult, setPapersResult] = useState<PaperImportResult | null>(null);
  const [parsingPapers, setParsingPapers] = useState(false);
  const [reviewFile, setReviewFile] = useState<string | null>(null);
  const [reviewResult, setReviewResult] = useState<ReviewImportResult | null>(null);
  const [parsingReviews, setParsingReviews] = useState(false);
  const [unknownIds, setUnknownIds] = useState<{ updated: number; unknown: string[] } | null>(null);

  const trackList = useMemo(
    () => [...(tracks.data ?? [])].sort((a, b) => a.sortOrder - b.sortOrder),
    [tracks.data],
  );
  const trackNames = trackList.map((t) => t.name);

  const busy = importPapers.isPending || importReviews.isPending || parsingPapers || parsingReviews;

  const clearPapers = () => {
    setPapersResult(null);
    setPapersFile(null);
    if (papersInput.current != null) papersInput.current.value = '';
  };
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

  const onPapersFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file == null) return;
    if (trackList.length === 0) {
      toast.error('Tracks are still loading — please try again in a moment.');
      return;
    }
    setParsingPapers(true);
    try {
      const rows = await readSheetRows(file);
      setPapersFile(file.name);
      setPapersResult(parsePapers(rows, trackNames));
    } catch (err) {
      toast.error(`Could not read the file: ${friendlyError(err)}`);
      clearPapers();
    } finally {
      setParsingPapers(false);
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

  const doImportPapers = () => {
    const res = papersResult;
    if (res == null || res.papers.length === 0) return;
    importPapers.mutate(
      res.papers.map((p) => p.toJson()),
      {
        onSuccess: (out) => {
          toast.success(`Imported: ${out.inserted} new, ${out.updated} updated`);
          clearPapers();
        },
        onError: (e) => toast.error(friendlyError(e)),
      },
    );
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

  if (tracks.isError) {
    return (
      <QueryError
        message={tracks.error instanceof Error ? tracks.error.message : 'Could not load tracks.'}
        onRetry={() => void tracks.refetch()}
      />
    );
  }

  const withReview = papersResult?.papers.filter((p) => p.reviewScore != null).length ?? 0;

  return (
    <div className="max-w-3xl flex flex-col gap-4">
      <input
        ref={papersInput}
        type="file"
        accept=".xlsx"
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
        onChange={(e) => void onPapersFile(e)}
      />
      <input
        ref={reviewsInput}
        type="file"
        accept=".xlsx"
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
        onChange={(e) => void onReviewsFile(e)}
      />

      {/* 1. Papers & authors */}
      <Card className="p-4">
        <div className="flex items-center gap-2">
          <FileSpreadsheet size={20} className="text-primary dark:text-primary shrink-0" />
          <h3 className="text-base font-semibold">1. Papers &amp; authors</h3>
        </div>
        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
          Columns: Paper ID, Title, Track, Author Name, Affiliation, Email, Phone, Review Score
          (optional). Use one row per author — rows with the same Paper ID become one paper. Track
          must be one of: {trackNames.join(', ')}. Re-uploading updates existing papers.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => void download(papersTemplate)}>
            <Download size={16} />
            Template
          </Button>
          <Button
            variant="outline"
            onClick={() => papersInput.current?.click()}
            disabled={busy}
            loading={parsingPapers}
          >
            <FolderOpen size={16} />
            Choose .xlsx file
          </Button>
          {papersFile && (
            <span className="text-xs text-gray-500 dark:text-gray-400 max-w-[180px] truncate">
              {papersFile}
            </span>
          )}
        </div>

        {papersResult != null && (
          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-800">
            <div className="flex flex-wrap gap-1.5">
              <Chip tone="green">{papersResult.papers.length} papers ready</Chip>
              <Chip tone="indigo">{papersResult.authorCount} authors</Chip>
              <Chip tone="green">{withReview} with review score</Chip>
              {papersResult.skippedPids.size > 0 && (
                <Chip tone="red">{papersResult.skippedPids.size} papers skipped</Chip>
              )}
            </div>
            <IssuesList
              issues={papersResult.issues}
              note={
                papersResult.skippedPids.size === 0
                  ? null
                  : 'Papers with problems are skipped. Fix the file and upload again to include them.'
              }
            />
            {papersResult.papers.length > 0 && (
              <>
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-sm" aria-label="Papers preview">
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-gray-800 text-left text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                        <th className="py-2 pr-4 font-medium">Paper ID</th>
                        <th className="py-2 pr-4 font-medium">Title</th>
                        <th className="py-2 pr-4 font-medium">Track</th>
                        <th className="py-2 pr-4 font-medium">Authors</th>
                        <th className="py-2 font-medium text-right">Review</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                      {papersResult.papers.slice(0, 50).map((p) => (
                        <tr key={p.pid}>
                          <td className="py-2 pr-4 font-medium whitespace-nowrap">{p.pid}</td>
                          <td className="py-2 pr-4 max-w-[240px] truncate" title={p.title}>
                            {p.title}
                          </td>
                          <td className="py-2 pr-4 whitespace-nowrap">{p.track}</td>
                          <td className="py-2 pr-4 max-w-[200px] truncate">
                            {p.authors.map((a) => a.name).join(', ')}
                          </td>
                          <td className="py-2 text-right tabular-nums">{fmtScore(p.reviewScore)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {papersResult.papers.length > 50 && (
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Showing first 50 of {papersResult.papers.length}
                  </p>
                )}
              </>
            )}
            {papersResult.papers.length > 0 && (
              <div className="mt-3 flex flex-col sm:flex-row sm:justify-end">
                <Button className="w-full sm:w-auto" onClick={doImportPapers} loading={importPapers.isPending} disabled={busy}>
                  <CloudUpload size={16} />
                  Import {papersResult.papers.length} papers
                </Button>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* 2. Review scores */}
      <Card className="p-4">
        <div className="flex items-center gap-2">
          <ClipboardCheck size={20} className="text-primary dark:text-primary shrink-0" />
          <h3 className="text-base font-semibold">2. Review scores (out of 50)</h3>
        </div>
        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
          Columns: Paper ID, Review Score (Title and Track are included for reference and ignored
          on upload). The template is pre-filled with every paper already in the system — fill
          only the Review Score column. Blank rows are silently skipped, so you can re-upload later
          with the remaining scores.
        </p>
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
