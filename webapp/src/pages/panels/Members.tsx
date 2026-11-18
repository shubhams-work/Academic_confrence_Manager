import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { CloudUpload, Download, FolderOpen, UserPlus, Users } from 'lucide-react';
import { useBulkCreateMembers } from '../../lib/queries';
import { friendlyError, type BulkCreateMembersResult, type MemberDraft } from '../../lib/api';
import { parseMembers, type MemberImportResult } from '../../lib/membersImport';
import { credentialsWorkbook, membersTemplate, readSheetRows } from '../../lib/excel';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Chip } from '../../components/Chip';
import { Field, Input } from '../../components/Field';
import { Sheet } from '../../components/Sheet';
import { useToast } from '../../components/Toast';
import { IssuesList } from '../chair/parts/IssuesList';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * Chair + Incharge: bulk-create panel-member accounts from an .xlsx upload.
 * Each successful row produces a Supabase auth user with role = 'panel_member'
 * and a randomly generated password; the generated passwords are only shown
 * once (downloadable as .xlsx), so the Incharge is pushed to save them.
 */
export default function Members(): React.JSX.Element {
  const toast = useToast();
  const bulk = useBulkCreateMembers();

  const fileInput = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsed, setParsed] = useState<MemberImportResult | null>(null);
  const [parsing, setParsing] = useState(false);
  const [result, setResult] = useState<BulkCreateMembersResult | null>(null);

  // Manual single-member form.
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [affiliation, setAffiliation] = useState('');
  const [manualErrors, setManualErrors] = useState<{ name?: string; email?: string }>({});

  const busy = parsing || bulk.isPending;

  const clear = (): void => {
    setParsed(null);
    setFileName(null);
    if (fileInput.current != null) fileInput.current.value = '';
  };

  const onFile = async (e: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0];
    if (file == null) return;
    setParsing(true);
    try {
      const rows = await readSheetRows(file);
      setFileName(file.name);
      setParsed(parseMembers(rows));
    } catch (err) {
      toast.error(`Could not read the file: ${friendlyError(err)}`);
      clear();
    } finally {
      setParsing(false);
    }
  };

  const download = async (make: () => Promise<void>): Promise<void> => {
    try {
      await make();
    } catch (e) {
      toast.error(friendlyError(e));
    }
  };

  const doUpload = (): void => {
    if (parsed == null || parsed.rows.length === 0) return;
    bulk.mutate(parsed.rows, {
      onSuccess: (out) => {
        setResult(out);
        clear();
        if (out.errors > 0) {
          toast.error(`${out.created} created, ${out.skipped} already existed, ${out.errors} failed`);
        } else {
          toast.success(`${out.created} accounts created, ${out.skipped} already existed`);
        }
      },
      onError: (e) => toast.error(friendlyError(e)),
    });
  };

  const downloadCreds = async (): Promise<void> => {
    if (result == null) return;
    await download(() => credentialsWorkbook(result.credentials));
  };

  const clearManual = (): void => {
    setName('');
    setEmail('');
    setPhone('');
    setAffiliation('');
    setManualErrors({});
  };

  const addOne = (e: FormEvent): void => {
    e.preventDefault();
    const trimmedName = name.trim();
    const trimmedEmail = email.trim().toLowerCase();
    const errs: { name?: string; email?: string } = {};
    if (trimmedName === '') errs.name = 'Name is required';
    if (trimmedEmail === '') errs.email = 'Email is required';
    else if (!EMAIL_RE.test(trimmedEmail)) errs.email = 'Enter a valid email';
    setManualErrors(errs);
    if (errs.name != null || errs.email != null) return;

    const draft: MemberDraft = {
      name: trimmedName,
      email: trimmedEmail,
      phone: phone.trim() === '' ? null : phone.trim(),
      affiliation: affiliation.trim() === '' ? null : affiliation.trim(),
    };
    bulk.mutate([draft], {
      onSuccess: (out) => {
        setResult(out);
        const cred = out.credentials[0];
        if (cred?.status === 'created') {
          toast.success(`Account created for ${trimmedEmail}`);
          clearManual();
        } else if (cred?.status === 'exists') {
          toast.error(`${trimmedEmail} already has an account`);
        } else {
          toast.error(cred?.note ?? 'Could not create the account');
        }
      },
      onError: (err) => toast.error(friendlyError(err)),
    });
  };

  return (
    <div className="max-w-3xl flex flex-col gap-4">
      <input
        ref={fileInput}
        type="file"
        accept=".xlsx"
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
        onChange={(e) => void onFile(e)}
      />

      {/* 1. Manual: add a single panel member and generate their login. */}
      <Card className="p-4">
        <div className="flex items-center gap-2">
          <UserPlus size={20} className="text-primary shrink-0" />
          <h3 className="text-base font-semibold">Add a panel member</h3>
        </div>
        <p className="mt-2 text-xs text-ink-muted">
          Enter one member's details to create their sign-in account. A password is generated on
          save — download it afterwards and share it with that member. We do not keep a copy.
        </p>
        <form className="mt-3 flex flex-col gap-3" onSubmit={addOne} noValidate>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name" required error={manualErrors.name}>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="off"
                disabled={busy}
                placeholder="Dr. Jane Doe"
              />
            </Field>
            <Field label="Email" required error={manualErrors.email}>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="off"
                disabled={busy}
                placeholder="jane@example.edu"
              />
            </Field>
            <Field label="Phone" hint="Optional">
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                autoComplete="off"
                disabled={busy}
                inputMode="tel"
              />
            </Field>
            <Field label="Affiliation" hint="Optional">
              <Input
                value={affiliation}
                onChange={(e) => setAffiliation(e.target.value)}
                autoComplete="off"
                disabled={busy}
                placeholder="Institution / College"
              />
            </Field>
          </div>
          <div className="flex flex-col sm:flex-row sm:justify-end">
            <Button type="submit" className="w-full sm:w-auto" loading={bulk.isPending} disabled={busy}>
              <UserPlus size={16} />
              Create account
            </Button>
          </div>
        </form>
      </Card>

      {/* 2. Bulk: upload an .xlsx of many members. */}
      <Card className="p-4">
        <div className="flex items-center gap-2">
          <Users size={20} className="text-primary shrink-0" />
          <h3 className="text-base font-semibold">Add panel members in bulk</h3>
        </div>
        <p className="mt-2 text-xs text-ink-muted">
          Upload an .xlsx with one row per panel member. Columns: <strong>Name</strong>,{' '}
          <strong>Email</strong>, Phone (optional), Affiliation (optional). Each row becomes a
          sign-in account with a randomly generated password. You will download the password list
          after the upload — save it, we do not keep a copy.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => void download(membersTemplate)}>
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
          {fileName != null && (
            <span className="text-xs text-ink-muted max-w-[180px] truncate">{fileName}</span>
          )}
        </div>

        {parsed != null && (
          <div className="mt-4 pt-4 border-t border-line">
            <div className="flex flex-wrap gap-1.5">
              <Chip tone="green">{parsed.rows.length} members ready</Chip>
              {parsed.duplicateEmails.length > 0 && (
                <Chip tone="red">{parsed.duplicateEmails.length} duplicate emails</Chip>
              )}
              {parsed.issues.length > 0 && (
                <Chip tone="red">{parsed.issues.length} issues</Chip>
              )}
            </div>
            <IssuesList
              issues={parsed.issues}
              note={
                parsed.issues.length === 0
                  ? null
                  : 'Rows with problems are skipped. Fix the sheet and re-upload to include them.'
              }
            />
            {parsed.rows.length > 0 && (
              <>
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-sm" aria-label="Members preview">
                    <thead>
                      <tr className="border-b border-line text-left text-xs font-medium uppercase tracking-wide text-ink-muted">
                        <th className="py-2 pr-4 font-medium">Name</th>
                        <th className="py-2 pr-4 font-medium">Email</th>
                        <th className="py-2 pr-4 font-medium">Phone</th>
                        <th className="py-2 pr-4 font-medium">Affiliation</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {parsed.rows.slice(0, 50).map((r) => (
                        <tr key={r.email}>
                          <td className="py-2 pr-4 whitespace-nowrap">{r.name}</td>
                          <td className="py-2 pr-4 whitespace-nowrap">{r.email}</td>
                          <td className="py-2 pr-4 whitespace-nowrap">{r.phone ?? ''}</td>
                          <td className="py-2 pr-4 max-w-[220px] truncate" title={r.affiliation ?? ''}>
                            {r.affiliation ?? ''}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {parsed.rows.length > 50 && (
                  <p className="mt-1 text-xs text-ink-muted">
                    Showing first 50 of {parsed.rows.length}
                  </p>
                )}
                <div className="mt-3 flex flex-col sm:flex-row sm:justify-end">
                  <Button className="w-full sm:w-auto" onClick={doUpload} loading={bulk.isPending} disabled={busy}>
                    <CloudUpload size={16} />
                    Create {parsed.rows.length} accounts
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </Card>

      {/* Post-upload result dialog with the generated credentials. */}
      <Sheet
        open={result != null}
        onClose={() => setResult(null)}
        title={
          result == null
            ? ''
            : `Created ${result.created} · Skipped ${result.skipped}${result.errors > 0 ? ` · Failed ${result.errors}` : ''}`
        }
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" onClick={() => setResult(null)}>
              Close
            </Button>
            <Button onClick={() => void downloadCreds()}>
              <Download size={16} />
              Download credentials
            </Button>
          </div>
        }
      >
        {result && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-ink-muted">
              Download the credentials file now — passwords will not be shown again. Share each row
              with the member whose email appears in it.
            </p>
            <div className="overflow-x-auto rounded-lg border border-line">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs font-medium uppercase tracking-wide text-ink-muted">
                    <th className="py-2 px-3">Email</th>
                    <th className="py-2 px-3">Password</th>
                    <th className="py-2 px-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {result.credentials.map((c) => (
                    <tr key={c.email}>
                      <td className="py-2 px-3 whitespace-nowrap">{c.email}</td>
                      <td className="py-2 px-3 font-mono tabular-nums">
                        {c.password === '' ? '—' : c.password}
                      </td>
                      <td className="py-2 px-3">
                        {c.status === 'created' && <Chip tone="green">created</Chip>}
                        {c.status === 'exists' && <Chip tone="gray">already existed</Chip>}
                        {c.status === 'error' && (
                          <span title={c.note ?? ''}>
                            <Chip tone="red">error</Chip>
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Sheet>
    </div>
  );
}
