import { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { Button } from '../../../components/Button';
import { Input } from '../../../components/Field';
import { ListSkeleton, QueryError } from '../../../components/QueryError';
import { Sheet } from '../../../components/Sheet';
import { useToast } from '../../../components/Toast';
import { friendlyError } from '../../../lib/api';
import { usePapers, useSetPaperPanel } from '../../../lib/queries';
import type { Panel } from '../../../lib/types';

/** Lists the unassigned papers of the panel's track, with checkboxes and search. */
export function AssignPapersSheet({ open, onClose, panel }: { open: boolean; onClose: () => void; panel: Panel }): React.JSX.Element {
  const papers = usePapers(panel.trackId);
  const assign = useSetPaperPanel();
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (open) {
      setQuery('');
      setSelected(new Set());
    }
  }, [open]);

  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (papers.data ?? [])
      .filter((p) => p.panelId == null)
      .filter(
        (p) =>
          q === '' ||
          p.pid.toLowerCase().includes(q) ||
          p.title.toLowerCase().includes(q) ||
          p.authors.some((a) => a.name.toLowerCase().includes(q)),
      )
      .sort((a, b) => a.pid.localeCompare(b.pid));
  }, [papers.data, query]);

  const toggle = (id: string): void => {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const submit = (): void => {
    assign.mutate(
      { paperIds: [...selected], panelId: panel.id },
      {
        onSuccess: () => {
          toast.success(`Assigned ${selected.size} paper${selected.size === 1 ? '' : 's'}`);
          onClose();
        },
        onError: (e) => toast.error(friendlyError(e)),
      },
    );
  };

  return (
    <Sheet
      open={open}
      onClose={assign.isPending ? () => undefined : onClose}
      title="Assign papers"
      persistent
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={assign.isPending}>
            Cancel
          </Button>
          <Button onClick={submit} loading={assign.isPending} disabled={selected.size === 0}>
            Assign{selected.size > 0 ? ` ${selected.size}` : ''}
          </Button>
        </>
      }
    >
      <p className="mb-3 text-sm text-ink-muted">Papers of this track that don’t have a panel yet.</p>
      <div className="relative mb-3">
        <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" aria-hidden />
        <Input
          className="pl-10"
          placeholder="Search by Paper ID, title or author"
          inputMode="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search papers"
        />
      </div>

      {papers.isLoading ? (
        <ListSkeleton count={4} height="h-16" />
      ) : papers.isError ? (
        <QueryError message={friendlyError(papers.error)} onRetry={() => void papers.refetch()} />
      ) : candidates.length === 0 ? (
        <p className="py-8 text-center text-sm text-ink-muted">
          {query.trim() === '' ? 'Every paper in this track already has a panel.' : 'No unassigned papers match the search.'}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {candidates.map((p) => (
            <li key={p.id}>
              <label className="flex min-h-14 cursor-pointer items-start gap-3 rounded-xl border border-line p-3 hover:bg-muted/60 has-[:checked]:border-primary has-[:checked]:bg-primary/5 dark:has-[:checked]:bg-primary/10">
                <input
                  type="checkbox"
                  className="mt-0.5 h-5 w-5 shrink-0 accent-primary"
                  checked={selected.has(p.id)}
                  onChange={() => toggle(p.id)}
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium break-words line-clamp-2">
                    {p.pid} · {p.title}
                  </span>
                  {p.authors.length > 0 && (
                    <span className="block truncate text-xs text-ink-muted">{p.authors.map((a) => a.name).join(', ')}</span>
                  )}
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}
