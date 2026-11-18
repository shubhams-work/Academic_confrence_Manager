// Create / edit a panel: name, track, venue, optional date-time and exactly
// two members. Full-screen sheet on phones, modal on desktop.
// Port of ../lib/features/panels/panel_form_page.dart.

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Button } from '../../components/Button';
import { Field, Input, Select } from '../../components/Field';
import { Sheet } from '../../components/Sheet';
import { useToast } from '../../components/Toast';
import { friendlyError, type PanelMemberSuggestion } from '../../lib/api';
import { usePanelMemberSuggestions, useSavePanel, useTracks } from '../../lib/queries';
import type { Panel, PanelMemberInput } from '../../lib/types';
import { emailError, fromLocalInput, toLocalInput } from './parts/util';

interface PanelFormProps {
  open: boolean;
  onClose: () => void;
  /** Panel to edit, or null/undefined to create a new one. */
  panel?: Panel | null;
  /** Pre-selected track for a new panel (e.g. the current filter). */
  defaultTrackId?: number | null;
  /** Called with the panel id after a successful save. */
  onSaved?: (id: string) => void;
}

const blankMember = (): PanelMemberInput => ({ name: '', email: '', phone: '', affiliation: '' });

interface Errors {
  name?: string;
  track?: string;
  members: [{ name?: string; email?: string }, { name?: string; email?: string }];
}

export default function PanelForm({ open, onClose, panel, defaultTrackId, onSaved }: PanelFormProps): React.JSX.Element | null {
  const tracks = useTracks();
  const save = useSavePanel();
  const toast = useToast();
  const suggestions = usePanelMemberSuggestions();

  const suggestByEmail = useMemo(
    () => new Map((suggestions.data ?? []).map((s) => [s.email.toLowerCase(), s])),
    [suggestions.data],
  );

  const [name, setName] = useState('');
  const [trackId, setTrackId] = useState<number | ''>('');
  const [venue, setVenue] = useState('');
  const [when, setWhen] = useState('');
  const [members, setMembers] = useState<[PanelMemberInput, PanelMemberInput]>([blankMember(), blankMember()]);
  const [errors, setErrors] = useState<Errors>({ members: [{}, {}] });

  // Reset the fields every time the sheet opens.
  useEffect(() => {
    if (!open) return;
    setName(panel?.name ?? '');
    setTrackId(panel?.trackId ?? defaultTrackId ?? '');
    setVenue(panel?.venue ?? '');
    setWhen(toLocalInput(panel?.scheduledAt));
    const byPos = (pos: number): PanelMemberInput => {
      const m = panel?.members.find((x) => x.position === pos);
      return m == null
        ? blankMember()
        : { name: m.name, email: m.email, phone: m.phone ?? '', affiliation: m.affiliation ?? '' };
    };
    setMembers([byPos(1), byPos(2)]);
    setErrors({ members: [{}, {}] });
  }, [open, panel, defaultTrackId]);

  // A finalized track can't take new panels; keep the current one selectable when editing.
  const trackOptions = (tracks.data ?? []).filter((t) => t.finalizedAt == null || t.id === panel?.trackId);

  const setMember = (i: 0 | 1, patch: Partial<PanelMemberInput>): void => {
    setMembers((ms) => {
      const next: [PanelMemberInput, PanelMemberInput] = [ms[0], ms[1]];
      next[i] = { ...ms[i], ...patch };
      return next;
    });
  };

  // When the typed/picked email matches an onboarded member, fill the rest.
  const onEmailChange = (i: 0 | 1, email: string): void => {
    const match = suggestByEmail.get(email.trim().toLowerCase());
    if (match != null) {
      setMember(i, {
        email,
        name: match.name,
        phone: match.phone,
        affiliation: match.affiliation,
      });
    } else {
      setMember(i, { email });
    }
  };

  const submit = (e: FormEvent): void => {
    e.preventDefault();
    const errs: Errors = { members: [{}, {}] };
    if (name.trim() === '') errs.name = 'Panel name is required';
    if (trackId === '') errs.track = 'Track is required';
    members.forEach((m, i) => {
      const slot = errs.members[i as 0 | 1];
      const email = m.email.trim();
      const ee = emailError(email);
      if (ee != null) slot.email = ee;
      else if (m.name.trim() === '') {
        // Email is valid but did not resolve to an onboarded member.
        slot.email = 'No onboarded member has this email — add them in Members first';
      }
    });
    const sameEmail =
      members[0].email.trim() !== '' && members[0].email.trim().toLowerCase() === members[1].email.trim().toLowerCase();
    if (sameEmail) errs.members[1].email = 'The two members must have different emails';
    setErrors(errs);
    const hasErr = errs.name != null || errs.track != null || errs.members.some((m) => m.name != null || m.email != null);
    if (hasErr || trackId === '') {
      if (sameEmail) toast.error('The two members must have different emails');
      return;
    }

    save.mutate(
      {
        id: panel?.id,
        name: name.trim(),
        trackId,
        venue: venue.trim() === '' ? null : venue.trim(),
        scheduledAt: fromLocalInput(when),
        members: members.map((m) => ({
          name: m.name.trim(),
          email: m.email.trim().toLowerCase(),
          phone: m.phone.trim(),
          affiliation: m.affiliation.trim(),
        })),
      },
      {
        onSuccess: (id) => {
          toast.success(panel == null ? 'Panel created' : 'Panel saved');
          onClose();
          onSaved?.(id);
        },
        onError: (err) => toast.error(friendlyError(err)),
      },
    );
  };

  return (
    <Sheet
      open={open}
      onClose={save.isPending ? () => undefined : onClose}
      title={panel == null ? 'New panel' : 'Edit panel'}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>
            Cancel
          </Button>
          <Button type="submit" form="panel-form" loading={save.isPending}>
            Save
          </Button>
        </>
      }
    >
      <form id="panel-form" onSubmit={submit} noValidate className="flex flex-col gap-4">
        <Field label="Panel name" required error={errors.name ?? null}>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Computing – Panel A"
            autoComplete="off"
          />
        </Field>
        <Field
          label="Track"
          required
          error={errors.track ?? null}
          hint={panel != null && panel.papers.length > 0 ? 'Unassign this panel’s papers before changing its track.' : undefined}
        >
          <Select value={trackId} onChange={(e) => setTrackId(e.target.value === '' ? '' : Number(e.target.value))}>
            <option value="">Select a track…</option>
            {trackOptions.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Venue">
            <Input value={venue} onChange={(e) => setVenue(e.target.value)} placeholder="e.g. Seminar Hall 2" />
          </Field>
          <Field label="Date & time" hint="Optional">
            <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
          </Field>
        </div>

        {([0, 1] as const).map((i) => {
          const m = members[i];
          const matched = m.name.trim() !== '';
          const showNoMatch = !matched && emailError(m.email) == null && m.email.trim() !== '';
          return (
          <fieldset key={i} className="rounded-xl border border-line p-3">
            <legend className="px-1 text-sm font-semibold">Panel member {i + 1}</legend>
            <div className="flex flex-col gap-3">
              <Field label="Email" required error={errors.members[i].email ?? null} hint="Start typing to pick an onboarded member">
                <MemberEmailCombobox
                  value={m.email}
                  suggestions={suggestions.data ?? []}
                  onType={(email) => onEmailChange(i, email)}
                  onPick={(s) =>
                    setMember(i, { email: s.email, name: s.name, phone: s.phone, affiliation: s.affiliation })
                  }
                />
              </Field>
              {matched && (
                <div className="rounded-lg bg-muted/60 px-3 py-2 text-sm">
                  <p className="font-medium text-ink">{m.name}</p>
                  {(m.phone || m.affiliation) && (
                    <p className="text-xs text-ink-muted">
                      {[m.affiliation, m.phone].filter(Boolean).join(' · ')}
                    </p>
                  )}
                </div>
              )}
              {showNoMatch && (
                <p className="text-xs text-ink-muted">
                  No onboarded member has this email yet. Add them under <strong>Members</strong> first.
                </p>
              )}
            </div>
          </fieldset>
          );
        })}
      </form>
    </Sheet>
  );
}

interface ComboboxProps {
  value: string;
  suggestions: PanelMemberSuggestion[];
  onType: (email: string) => void;
  onPick: (s: PanelMemberSuggestion) => void;
}

/** Email input with a styled suggestion dropdown anchored under the field. */
const DROPDOWN_H = 264;

function MemberEmailCombobox({ value, suggestions, onType, onPick }: ComboboxProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [dropUp, setDropUp] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  // Open upward when the field is near the bottom of the viewport/sheet.
  const place = (): void => {
    const rect = wrap.current?.getBoundingClientRect();
    if (rect == null) return;
    const below = window.innerHeight - rect.bottom;
    setDropUp(below < DROPDOWN_H && rect.top > below);
  };

  const q = value.trim().toLowerCase();
  const matches = useMemo(() => {
    const list = q === ''
      ? suggestions
      : suggestions.filter((s) => s.email.toLowerCase().includes(q) || s.name.toLowerCase().includes(q));
    return list.slice(0, 8);
  }, [suggestions, q]);

  // Close when focus/click leaves the widget.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent): void => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const choose = (s: PanelMemberSuggestion): void => {
    onPick(s);
    setOpen(false);
  };

  const showList = open && matches.length > 0;

  return (
    <div ref={wrap} className="relative">
      <Input
        type="email"
        inputMode="email"
        autoCapitalize="none"
        autoComplete="off"
        role="combobox"
        aria-expanded={showList}
        aria-autocomplete="list"
        value={value}
        onFocus={() => {
          place();
          setOpen(true);
        }}
        onChange={(e) => {
          onType(e.target.value);
          place();
          setOpen(true);
          setActive(0);
        }}
        onKeyDown={(e) => {
          if (!showList) return;
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, matches.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === 'Enter') {
            e.preventDefault();
            const pick = matches[active];
            if (pick) choose(pick);
          } else if (e.key === 'Escape') {
            setOpen(false);
          }
        }}
      />
      {showList && (
        <ul
          role="listbox"
          className={`absolute left-0 right-0 z-40 max-h-60 overflow-auto rounded-lg border border-line bg-surface py-1 shadow-xl shadow-black/20 ${
            dropUp ? 'bottom-full mb-1' : 'top-full mt-1'
          }`}
        >
          {matches.map((s, idx) => (
            <li key={s.email} role="option" aria-selected={idx === active}>
              <button
                type="button"
                // onMouseDown beats the input blur so the pick registers.
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(s);
                }}
                onMouseEnter={() => setActive(idx)}
                className={`block w-full px-3 py-2 text-left ${idx === active ? 'bg-primary/10' : 'hover:bg-primary/5'}`}
              >
                <span className="block truncate text-sm font-medium text-ink">{s.name || s.email}</span>
                <span className="block truncate text-xs text-ink-muted">
                  {s.email}
                  {s.affiliation ? ` · ${s.affiliation}` : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
