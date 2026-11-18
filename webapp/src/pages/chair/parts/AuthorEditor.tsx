import { UserPlus, X } from 'lucide-react';
import { Button } from '../../../components/Button';
import { Card } from '../../../components/Card';
import { Field, Input } from '../../../components/Field';

/** One editable author row. `key` keeps React state stable across add/remove. */
export interface AuthorRow {
  key: number;
  name: string;
  affiliation: string;
  email: string;
  phone: string;
}

let authorRowSeq = 0;

export function newAuthorRow(init?: { name?: string; affiliation?: string; email?: string; phone?: string }): AuthorRow {
  return {
    key: ++authorRowSeq,
    name: init?.name ?? '',
    affiliation: init?.affiliation ?? '',
    email: init?.email ?? '',
    phone: init?.phone ?? '',
  };
}

export interface AuthorEditorProps {
  rows: AuthorRow[];
  /** Per-row error message (only the email field can error). */
  errors: (string | null)[];
  onChange: (rows: AuthorRow[]) => void;
}

/** Author list editor for the paper form: add/remove rows of
 *  name / affiliation / email / phone (port of the Dart _AuthorFields list). */
export function AuthorEditor({ rows, errors, onChange }: AuthorEditorProps) {
  const update = (i: number, patch: Partial<AuthorRow>) => {
    const next = rows.slice();
    const cur = next[i];
    if (cur == null) return;
    next[i] = { ...cur, ...patch };
    onChange(next);
  };

  return (
    <section>
      <div className="flex items-center justify-between gap-2 mb-2">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Authors</h3>
        <Button variant="ghost" type="button" onClick={() => onChange([...rows, newAuthorRow()])}>
          <UserPlus size={16} />
          Add author
        </Button>
      </div>
      <div className="flex flex-col gap-3">
        {rows.map((row, i) => (
          <Card key={row.key} className="p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                Author {i + 1}
              </span>
              <button
                type="button"
                aria-label={`Remove author ${i + 1}`}
                onClick={() => onChange(rows.filter((_, j) => j !== i))}
                className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                <X size={18} />
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Name">
                <Input
                  value={row.name}
                  onChange={(e) => update(i, { name: e.target.value })}
                  autoComplete="off"
                />
              </Field>
              <Field label="Affiliation (college / company)">
                <Input
                  value={row.affiliation}
                  onChange={(e) => update(i, { affiliation: e.target.value })}
                  autoComplete="off"
                />
              </Field>
              <Field label="Email" error={errors[i] ?? null}>
                <Input
                  type="email"
                  inputMode="email"
                  value={row.email}
                  onChange={(e) => update(i, { email: e.target.value })}
                  autoComplete="off"
                />
              </Field>
              <Field label="Phone">
                <Input
                  type="tel"
                  inputMode="tel"
                  value={row.phone}
                  onChange={(e) => update(i, { phone: e.target.value })}
                  autoComplete="off"
                />
              </Field>
            </div>
          </Card>
        ))}
      </div>
    </section>
  );
}
