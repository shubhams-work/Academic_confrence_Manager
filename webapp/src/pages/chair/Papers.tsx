import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { FileText, Plus, Search } from 'lucide-react';
import { usePapers, useTracks } from '../../lib/queries';
import type { Paper } from '../../lib/types';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { Input } from '../../components/Field';
import { TrackTabs } from '../../components/TrackTabs';
import { PapersList } from './parts/PapersList';
import { QueryError } from './parts/QueryError';

/** Chair: all papers with track filter and search (port of papers_page.dart). */
export default function Papers() {
  const navigate = useNavigate();
  const tracks = useTracks();
  const papers = usePapers(null);
  const [trackId, setTrackId] = useState<number | null>(null);
  const [query, setQuery] = useState('');

  const trackList = useMemo(
    () => [...(tracks.data ?? [])].sort((a, b) => a.sortOrder - b.sortOrder),
    [tracks.data],
  );
  const trackNames = useMemo(() => new Map(trackList.map((t) => [t.id, t.name])), [trackList]);
  const all = papers.data ?? [];
  const q = query.trim().toLowerCase();

  const list = useMemo(
    () =>
      all.filter((p) => {
        if (trackId != null && p.trackId !== trackId) return false;
        if (q === '') return true;
        return (
          p.pid.toLowerCase().includes(q) ||
          p.title.toLowerCase().includes(q) ||
          p.authors.some((a) => a.name.toLowerCase().includes(q))
        );
      }),
    [all, trackId, q],
  );

  const openForm = (paper: Paper | null) => {
    navigate(paper == null ? '/papers/new' : `/papers/${paper.id}/edit`);
  };

  if (tracks.isError || papers.isError) {
    const err = tracks.error ?? papers.error;
    return (
      <QueryError
        message={err instanceof Error ? err.message : 'Could not load papers.'}
        onRetry={() => {
          void tracks.refetch();
          void papers.refetch();
        }}
      />
    );
  }

  const loading = tracks.isLoading || papers.isLoading;

  return (
    <div>
      {/* Filters */}
      <TrackTabs tracks={trackList} selected={trackId} onChange={setTrackId} />
      <div className="relative mt-2 mb-4">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        <Input
          className="pl-10"
          placeholder="Search by Paper ID, title or author"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search papers"
          inputMode="search"
        />
      </div>

      {/* Count + desktop add button */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {papers.data != null ? `${all.length} paper${all.length === 1 ? '' : 's'}` : ''}
        </p>
        <Button variant="primary" className="hidden md:inline-flex" onClick={() => openForm(null)}>
          <Plus size={16} />
          Add paper
        </Button>
      </div>

      {loading ? (
        <div className="flex flex-col gap-2" aria-label="Loading papers">
          {Array.from({ length: 6 }, (_, i) => (
            <div
              key={i}
              className="h-24 rounded-xl bg-gray-100 dark:bg-gray-800 animate-pulse"
            />
          ))}
        </div>
      ) : list.length === 0 ? (
        <EmptyState
          icon={FileText}
          message={
            all.length === 0
              ? 'No papers yet. Use the Import tab to upload the papers Excel file.'
              : 'No papers match the filter. Try another track or a different search.'
          }
        />
      ) : (
        <>
          <PapersList papers={list} trackNames={trackNames} onOpen={openForm} />
          {list.length < all.length && (
            <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
              Showing {list.length} of {all.length} papers
            </p>
          )}
        </>
      )}

      {/* Phone FAB (the bottom tab bar sits at 56 px + safe area) */}
      <button
        type="button"
        onClick={() => openForm(null)}
        aria-label="Add paper"
        className="md:hidden fixed bottom-24 right-4 z-40 inline-flex items-center gap-2 rounded-full bg-primary text-primary-fg pl-4 pr-5 min-h-14 text-sm font-semibold shadow-lg hover:bg-primary active:bg-primary"
      >
        <Plus size={20} />
        Add paper
      </button>
    </div>
  );
}
