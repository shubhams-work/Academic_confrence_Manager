import { ChevronRight } from 'lucide-react';
import { Card } from '../../../components/Card';
import { Chip } from '../../../components/Chip';
import { fmtScore } from '../../../lib/scoring';
import type { Paper } from '../../../lib/types';

export interface PapersListProps {
  papers: Paper[];
  trackNames: Map<number, string>;
  onOpen: (paper: Paper) => void;
}

/** The chair's paper list: cards on phones, a real table on >= 768 px. */
export function PapersList({ papers, trackNames, onOpen }: PapersListProps) {
  return (
    <>
      {/* Cards (phones) */}
      <div className="md:hidden flex flex-col gap-2">
        {papers.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onOpen(p)}
            className="text-left w-full rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm p-4 hover:border-primary dark:hover:border-primary active:bg-gray-50 dark:active:bg-gray-800 transition-colors"
          >
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold tracking-wide text-primary">{p.pid}</p>
                <p className="mt-0.5 text-sm font-semibold line-clamp-2 break-words">
                  {p.title}
                </p>
                {p.authors.length > 0 && (
                  <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400 line-clamp-2 break-words">
                    {p.authors.map((a) => a.name).join(', ')}
                  </p>
                )}
              </div>
              <ChevronRight size={18} className="text-gray-400 mt-0.5 shrink-0" />
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Chip tone="indigo">{trackNames.get(p.trackId) ?? `Track ${p.trackId}`}</Chip>
              {p.reviewScore == null ? (
                <Chip tone="orange">Review: —</Chip>
              ) : (
                <Chip tone="green">Review: {fmtScore(p.reviewScore)}/50</Chip>
              )}
              <Chip tone={p.panelName == null ? 'gray' : 'indigo'}>{p.panelName ?? 'No panel'}</Chip>
            </div>
          </button>
        ))}
      </div>

      {/* Table (>= 768 px) */}
      <Card className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-800 text-left text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
              <th className="px-4 py-3 font-medium">Paper ID</th>
              <th className="px-4 py-3 font-medium">Title</th>
              <th className="px-4 py-3 font-medium">Authors</th>
              <th className="px-4 py-3 font-medium">Track</th>
              <th className="px-4 py-3 font-medium text-right">Review /50</th>
              <th className="px-4 py-3 font-medium">Panel</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {papers.map((p) => (
              <tr
                key={p.id}
                onClick={() => onOpen(p)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onOpen(p);
                  }
                }}
                tabIndex={0}
                aria-label={`Edit paper ${p.pid}: ${p.title}`}
                className="cursor-pointer hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary dark:hover:bg-gray-800/60"
              >
                <td className="px-4 py-3 font-medium whitespace-nowrap">{p.pid}</td>
                <td className="px-4 py-3 max-w-[280px] truncate" title={p.title}>
                  {p.title}
                </td>
                <td className="px-4 py-3 max-w-[200px] truncate">
                  {p.authors.map((a) => a.name).join(', ')}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {trackNames.get(p.trackId) ?? `Track ${p.trackId}`}
                </td>
                <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap">
                  {p.reviewScore == null ? (
                    <span className="text-gray-400">—</span>
                  ) : (
                    fmtScore(p.reviewScore)
                  )}
                </td>
                <td className="px-4 py-3 max-w-[160px] truncate">
                  {p.panelName ?? <span className="text-gray-400">No panel</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
