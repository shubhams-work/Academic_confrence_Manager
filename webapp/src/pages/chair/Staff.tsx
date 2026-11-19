import { useMemo, useState } from 'react';
import { Badge, BadgeCheck, Info, RotateCcw, Star, Trash2 } from 'lucide-react';
import {
  useRemoveStaffInvite,
  useSetResetAccess,
  useStaffInvites,
  useStaffProfiles,
} from '../../lib/queries';
import { friendlyError } from '../../lib/api';
import { roleLabel, type Profile, type StaffInvite } from '../../lib/types';
import { useAuth } from '../../lib/auth';
import { useToast } from '../../components/Toast';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Chip } from '../../components/Chip';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { EmptyState } from '../../components/EmptyState';
import { QueryError } from './parts/QueryError';
import { AccountCreator } from '../panels/parts/AccountCreator';

/** Organizing Chair: create Session Incharge accounts — the same flow as the
 *  panelist invite (one at a time or an .xlsx upload, each getting a generated
 *  password) — and manage who already has access. */
export default function Staff() {
  const toast = useToast();
  const auth = useAuth();
  const invites = useStaffInvites();
  const profiles = useStaffProfiles();
  const removeInvite = useRemoveStaffInvite();
  const setResetAccess = useSetResetAccess();

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
    <div className="flex max-w-3xl flex-col">
      {/* Hint */}
      <Card className="p-4 mb-4 flex gap-3">
        <Info size={20} className="text-primary dark:text-primary shrink-0 mt-0.5" />
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Create a sign-in account for each Session Incharge below, then hand them the generated
          password — the same way panelist accounts are created. Panel members do not need to be
          added here; a Session Incharge adds them from the Panelists tab.
        </p>
      </Card>

      <AccountCreator role="session_incharge" />

      <h3 className="mb-3 mt-6 text-base font-semibold">
        Session Incharges and co-chairs
        {invites.data != null ? ` (${list.length})` : ''}
      </h3>

      {invites.isLoading ? (
        <div className="flex flex-col gap-2" aria-label="Loading staff">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="h-20 rounded-xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <EmptyState
          icon={Badge}
          message="Nobody added yet. Create a Session Incharge account above."
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
