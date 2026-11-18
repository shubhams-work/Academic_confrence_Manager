import { useMemo, useState, type FormEvent } from 'react';
import { Badge, BadgeCheck, Info, RotateCcw, Star, Trash2, UserPlus } from 'lucide-react';
import {
  useAddStaffInvite,
  useRemoveStaffInvite,
  useSetResetAccess,
  useStaffInvites,
  useStaffProfiles,
} from '../../lib/queries';
import { friendlyError } from '../../lib/api';
import { roleLabel, type AppRole, type Profile, type StaffInvite } from '../../lib/types';
import { useAuth } from '../../lib/auth';
import { useToast } from '../../components/Toast';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Chip } from '../../components/Chip';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { EmptyState } from '../../components/EmptyState';
import { Field, Input, Select } from '../../components/Field';
import { Sheet } from '../../components/Sheet';
import { QueryError } from './parts/QueryError';

const emailRe = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Organizing Chair: pre-approve Session Incharge / co-chair emails
 *  (port of staff_page.dart). */
export default function Staff() {
  const toast = useToast();
  const auth = useAuth();
  const invites = useStaffInvites();
  const profiles = useStaffProfiles();
  const addInvite = useAddStaffInvite();
  const removeInvite = useRemoveStaffInvite();
  const setResetAccess = useSetResetAccess();

  const [inviteOpen, setInviteOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<AppRole>('session_incharge');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<StaffInvite | null>(null);
  const [resetTarget, setResetTarget] = useState<Profile | null>(null);

  const signedUp = useMemo(
    () => new Map((profiles.data ?? []).map((p) => [p.email, p])),
    [profiles.data],
  );
  const list = useMemo(
    () => [...(invites.data ?? [])].sort((a, b) => (a.email < b.email ? -1 : a.email > b.email ? 1 : 0)),
    [invites.data],
  );
  const myEmail = (auth.email ?? '').toLowerCase();

  const closeInvite = () => {
    setInviteOpen(false);
    setEmail('');
    setRole('session_incharge');
    setEmailError(null);
  };

  const submitInvite = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (trimmed === '') {
      setEmailError('Email is required');
      return;
    }
    if (!emailRe.test(trimmed)) {
      setEmailError('Enter a valid email');
      return;
    }
    addInvite.mutate(
      { email: trimmed, role },
      {
        onSuccess: () => {
          toast.success(`${trimmed} can now sign up as ${roleLabel[role]}`);
          closeInvite();
        },
        onError: (err) => toast.error(friendlyError(err)),
      },
    );
  };

  const onResetAccessConfirmed = () => {
    const p = resetTarget;
    if (p == null) return;
    const enabled = !p.canResetData;
    setResetAccess.mutate(
      { email: p.email, enabled },
      {
        onSuccess: () => {
          toast.success(
            enabled
              ? `${p.email} can now reset all event data`
              : `Reset access removed from ${p.email}`,
          );
          setResetTarget(null);
        },
        onError: (err) => {
          toast.error(friendlyError(err));
          setResetTarget(null);
        },
      },
    );
  };

  const onRemoveConfirmed = () => {
    const inv = removing;
    if (inv == null) return;
    removeInvite.mutate(inv.email, {
      onSuccess: () => setRemoving(null),
      onError: (err) => {
        toast.error(friendlyError(err));
        setRemoving(null);
      },
    });
  };

  if (invites.isError) {
    return (
      <QueryError
        message={invites.error instanceof Error ? invites.error.message : 'Could not load staff.'}
        onRetry={() => void invites.refetch()}
      />
    );
  }

  return (
    <div className="max-w-3xl">
      {/* Hint */}
      <Card className="p-4 mb-4 flex gap-3">
        <Info size={20} className="text-primary dark:text-primary shrink-0 mt-0.5" />
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Add the email of each Session Incharge here. They then sign up in the app with that same
          email. Panel members do not need to be added here — the Session Incharge adds them when
          creating a panel.
        </p>
      </Card>

      <div className="flex items-center justify-between gap-2 mb-3">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {invites.data != null ? `${list.length} invite${list.length === 1 ? '' : 's'}` : ''}
        </p>
        <Button className="hidden md:inline-flex" onClick={() => setInviteOpen(true)}>
          <UserPlus size={16} />
          Invite
        </Button>
      </div>

      {invites.isLoading ? (
        <div className="flex flex-col gap-2" aria-label="Loading staff">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="h-20 rounded-xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <EmptyState
          icon={Badge}
          message="No staff invited yet. Use the Invite button to add a Session Incharge or a co-chair."
        />
      ) : (
        <div className="flex flex-col gap-2">
          {list.map((inv) => {
            const profile = signedUp.get(inv.email);
            const name = profile != null && profile.fullName.trim() !== '' ? profile.fullName : inv.email;
            const isMe = inv.email.toLowerCase() === myEmail;
            return (
              <Card key={inv.email} className="p-4">
                <div className="flex items-start gap-3">
                  <div className="h-11 w-11 rounded-full bg-primary/10 dark:bg-primary/10 text-primary dark:text-primary flex items-center justify-center shrink-0">
                    {inv.role === 'organizing_chair' ? <Star size={20} /> : <Badge size={20} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{name}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{inv.email}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{roleLabel[inv.role]}</p>
                  </div>
                  {!isMe && (
                    <button
                      type="button"
                      aria-label={`Remove access for ${inv.email}`}
                      onClick={() => setRemoving(inv)}
                      className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 shrink-0"
                    >
                      <Trash2 size={18} />
                    </button>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 pl-14">
                  {profile != null ? (
                    <Chip tone="green">
                      <BadgeCheck size={12} />
                      Signed up
                    </Chip>
                  ) : (
                    <Chip tone="orange">Not signed up</Chip>
                  )}
                  {profile?.canResetData === true && (
                    <Chip tone="red">
                      <RotateCcw size={12} />
                      Can reset all data
                    </Chip>
                  )}
                  {profile != null && (
                    <Button
                      size="sm"
                      variant={profile.canResetData ? 'danger' : 'outline'}
                      onClick={() => setResetTarget(profile)}
                    >
                      {profile.canResetData ? 'Revoke reset access' : 'Allow training reset'}
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Phone FAB (the bottom tab bar sits at 56 px + safe area) */}
      <button
        type="button"
        onClick={() => setInviteOpen(true)}
        aria-label="Invite staff"
        className="md:hidden fixed bottom-24 right-4 z-40 inline-flex items-center gap-2 rounded-full bg-primary text-primary-fg pl-4 pr-5 min-h-14 text-sm font-semibold shadow-lg hover:bg-primary active:bg-primary"
      >
        <UserPlus size={20} />
        Invite
      </button>

      {/* Invite dialog */}
      <Sheet
        open={inviteOpen}
        onClose={closeInvite}
        title="Invite staff"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={closeInvite} disabled={addInvite.isPending}>
              Cancel
            </Button>
            <Button type="submit" form="invite-form" loading={addInvite.isPending}>
              Invite
            </Button>
          </div>
        }
      >
        <form id="invite-form" className="flex flex-col gap-4" onSubmit={submitInvite} noValidate>
          <Field label="Email" required error={emailError}>
            <Input
              type="email"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@college.edu"
              autoComplete="off"
            />
          </Field>
          <Field label="Role" required>
            <Select value={role} onChange={(e) => setRole(e.target.value as AppRole)}>
              <option value="session_incharge">Session Incharge</option>
              <option value="organizing_chair">Organizing Chair</option>
            </Select>
          </Field>
        </form>
      </Sheet>

      {/* Reset-access confirm */}
      <ConfirmDialog
        open={resetTarget != null}
        title={
          resetTarget == null
            ? ''
            : resetTarget.canResetData
              ? `Revoke reset access for ${resetTarget.email}?`
              : `Allow ${resetTarget.email} to reset all event data?`
        }
        message={
          resetTarget == null
            ? ''
            : resetTarget.canResetData
              ? 'The Reset tab disappears for them and the reset will be refused by the server. Do this before the real event.'
              : 'They get a Reset tab that deletes every evaluation, panel, panel member and review score across all tracks, for everyone. Grant this only for a rehearsal, and revoke it before the event.'
        }
        confirmLabel={resetTarget?.canResetData === true ? 'Revoke' : 'Allow'}
        destructive={resetTarget?.canResetData !== true}
        busy={setResetAccess.isPending}
        onConfirm={onResetAccessConfirmed}
        onCancel={() => setResetTarget(null)}
      />

      {/* Remove confirm */}
      <ConfirmDialog
        open={removing != null}
        title={removing ? `Remove ${removing.email}?` : ''}
        message={removing ? `They will lose ${roleLabel[removing.role]} access.` : ''}
        confirmLabel="Remove"
        destructive
        busy={removeInvite.isPending}
        onConfirm={onRemoveConfirmed}
        onCancel={() => setRemoving(null)}
      />
    </div>
  );
}
