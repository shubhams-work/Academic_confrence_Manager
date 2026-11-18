import { useState } from 'react';
import { ChevronDown, TriangleAlert } from 'lucide-react';
import type { ImportIssue } from '../../../lib/importParse';

export interface IssuesListProps {
  issues: ImportIssue[];
  note?: string | null;
}

/** Collapsible list of per-row import problems ("Row r: message"). */
export function IssuesList({ issues, note }: IssuesListProps) {
  const [open, setOpen] = useState(issues.length <= 5);
  if (issues.length === 0) return null;

  return (
    <div className="mt-3 rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 min-h-11 text-left"
      >
        <TriangleAlert size={16} className="text-red-600 dark:text-red-400 shrink-0" />
        <span className="flex-1 text-sm font-medium text-red-700 dark:text-red-300">
          {issues.length} problem{issues.length === 1 ? '' : 's'} found
        </span>
        <ChevronDown
          size={16}
          className={`text-red-600 dark:text-red-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div className="px-3 pb-3 border-t border-red-200 dark:border-red-900/60">
          {note && (
            <p className="text-xs text-red-600 dark:text-red-400 pt-2">{note}</p>
          )}
          <ul className="mt-1 space-y-1">
            {issues.slice(0, 200).map((issue, i) => (
              <li key={`${issue.row}-${i}`} className="text-xs text-red-700 dark:text-red-300">
                {issue.toString()}
              </li>
            ))}
            {issues.length > 200 && (
              <li className="text-xs text-red-700 dark:text-red-300">
                …and {issues.length - 200} more
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
