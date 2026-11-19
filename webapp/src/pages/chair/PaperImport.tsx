import { useMemo, useRef, useState, type ChangeEvent } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, CloudUpload, Download, FileSpreadsheet, FolderOpen } from 'lucide-react';
import { useImportPapers, useTracks } from '../../lib/queries';
import { friendlyError } from '../../lib/api';
import { parsePapers, type PaperImportResult } from '../../lib/importParse';
import { papersTemplate, readSheetRows } from '../../lib/excel';
import { fmtScore } from '../../lib/scoring';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Chip } from '../../components/Chip';
import { useToast } from '../../components/Toast';
import { IssuesList } from './parts/IssuesList';
import { QueryError } from './parts/QueryError';

/**
 * Chair: bulk-upload papers and their authors from an .xlsx file.
 *
 * Split out of the old combined Import page so that adding papers lives under
 * Papers (one at a time, or many from a sheet) while the Review scores tab
 * only deals with scores.
 */
export default function PaperImport() {
  const toast = useToast();
  const navigate = useNavigate();
  const tracks = useTracks();
  const importPapers = useImportPapers();

  const fileInput = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [result, setResult] = useState<PaperImportResult | null>(null);
  const [parsing, setParsing] = useState(false);

  const trackList = useMemo(
    () => [...(tracks.data ?? [])].sort((a, b) => a.sortOrder - b.sortOrder),
    [tracks.data],
  );
  const trackNames = trackList.map((t) => t.name);
  const busy = importPapers.isPending || parsing;

  const clear = () => {
    setResult(null);
    setFileName(null);
    if (fileInput.current != null) fileInput.current.value = '';
  };

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file == null) return;
    setParsing(true);
    try {
      const rows = await readSheetRows(file);
      setFileName(file.name);
      setResult(parsePapers(rows, trackNames));
    } catch (err) {
      toast.error(`Could not read the file: ${friendlyError(err)}`);
      clear();
    } finally {
      setParsing(false);
    }
  };

  const download = async (make: () => Promise<void>) => {
    try {
      await make();
    } catch (e) {
      toast.error(friendlyError(e));
    }
  };

  const doImport = () => {
    const res = result;
    if (res == null || res.papers.length === 0) return;
    importPapers.mutate(
      res.papers.map((p) => p.toJson()),
      {
        onSuccess: (out) => {
          toast.success(`${out.inserted} papers added, ${out.updated} updated`);
          clear();
          navigate('/papers');
        },
        onError: (e) => toast.error(friendlyError(e)),
      },
    );
  };

  if (tracks.isError) {
    return (
      <QueryError
        message={tracks.error instanceof Error ? tracks.error.message : 'Could not load tracks.'}
        onRetry={() => void tracks.refetch()}
      />
    );
  }

  const withReview = result?.papers.filter((p) => p.reviewScore != null).length ?? 0;

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <input
        ref={fileInput}
        type="file"
        accept=".xlsx"
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
        onChange={(e) => void onFile(e)}
      />

      <div>
        <Button variant="ghost" size="sm" onClick={() => navigate('/papers')}>
          <ArrowLeft size={16} />
          Back to papers
        </Button>
      </div>

      <Card className="p-4">
        <div className="flex items-center gap-2">
          <FileSpreadsheet size={20} className="shrink-0 text-primary dark:text-primary" />
          <h3 className="text-base font-semibold">Bulk upload papers and authors</h3>
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
            onClick={() => fileInput.current?.click()}
            disabled={busy}
            loading={parsing}
          >
            <FolderOpen size={16} />
            Choose .xlsx file
          </Button>
          {fileName && (
            <span className="max-w-[180px] truncate text-xs text-gray-500 dark:text-gray-400">
              {fileName}
            </span>
          )}
        </div>

        {result != null && (
          <div className="mt-4 border-t border-gray-200 pt-4 dark:border-gray-800">
            <div className="flex flex-wrap gap-1.5">
              <Chip tone="green">{result.papers.length} papers ready</Chip>
              <Chip tone="indigo">{result.authorCount} authors</Chip>
              <Chip tone="green">{withReview} with review score</Chip>
              {result.skippedPids.size > 0 && (
                <Chip tone="red">{result.skippedPids.size} papers skipped</Chip>
              )}
            </div>
            <IssuesList
              issues={result.issues}
              note={
                result.skippedPids.size === 0
                  ? null
                  : 'Papers with problems are skipped. Fix the file and upload again to include them.'
              }
            />
            {result.papers.length > 0 && (
              <>
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-sm" aria-label="Papers preview">
                    <thead>
                      <tr className="border-b border-gray-200 text-left text-xs font-medium uppercase tracking-wide text-gray-500 dark:border-gray-800 dark:text-gray-400">
                        <th className="py-2 pr-4 font-medium">Paper ID</th>
                        <th className="py-2 pr-4 font-medium">Title</th>
                        <th className="py-2 pr-4 font-medium">Track</th>
                        <th className="py-2 pr-4 font-medium">Authors</th>
                        <th className="py-2 text-right font-medium">Review</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                      {result.papers.slice(0, 50).map((p) => (
                        <tr key={p.pid}>
                          <td className="whitespace-nowrap py-2 pr-4 font-medium">{p.pid}</td>
                          <td className="max-w-[240px] truncate py-2 pr-4" title={p.title}>
                            {p.title}
                          </td>
                          <td className="whitespace-nowrap py-2 pr-4">{p.track}</td>
                          <td className="max-w-[200px] truncate py-2 pr-4">
                            {p.authors.map((a) => a.name).join(', ')}
                          </td>
                          <td className="py-2 text-right tabular-nums">{fmtScore(p.reviewScore)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {result.papers.length > 50 && (
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Showing first 50 of {result.papers.length}
                  </p>
                )}
                <div className="mt-3 flex flex-col sm:flex-row sm:justify-end">
                  <Button
                    className="w-full sm:w-auto"
                    onClick={doImport}
                    loading={importPapers.isPending}
                    disabled={busy}
                  >
                    <CloudUpload size={16} />
                    Import {result.papers.length} papers
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
