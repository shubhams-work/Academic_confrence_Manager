// Panel detail (Chair + Session Incharge): members with sign-up status and the
// assigned papers with each member's evaluation status. Assign / remove
// papers, unlock a submitted evaluation (Chair), edit or delete the panel.
// Port of ../lib/features/panels/panel_detail_page.dart.

import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  FileText,
  Lock,
  LockOpen,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Chip } from '../../components/Chip';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { EmptyState } from '../../components/EmptyState';
import { ListSkeleton, QueryError } from '../../components/QueryError';
import { useToast } from '../../components/Toast';
import { friendlyError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useDeletePanel, usePanel, useSetPaperPanel, useTracks, useUnlockEvaluation } from '../../lib/queries';
import { fmtScore } from '../../lib/scoring';
import { evalTotal, type Panel, type PanelMember, type Paper } from '../../lib/types';
import PanelForm from './PanelForm';
import { AssignPapersSheet } from './parts/AssignPapersSheet';
import { evaluationOf, paperPresentation, venueLine } from './parts/util';

type Confirm =
  | { kind: 'delete' }
  | { kind: 'remove'; paper: Paper }
  | { kind: 'unlock'; paper: Paper; member: PanelMember; evaluationId: string };

export default function PanelDetail(): React.JSX.Element {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const auth = useAuth();
  const isChair = auth.role === 'organizing_chair';
  const toast = useToast();

  const panelQ = usePanel(id);
  const tracks = useTracks();
  const del = useDeletePanel();
  const setPanel = useSetPaperPanel();
  const unlock = useUnlockEvaluation();

  const [editOpen, setEditOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [confirm, setConfirm] = useState<Confirm | null>(null);

  const back = (
    <Link
      to="/panels"
      className="-ml-2 mb-2 inline-flex h-11 items-center gap-1 rounded-lg px-2 text-sm font-medium text-primary hover:bg-muted dark:text-primary"
    >
      <ArrowLeft size={18} aria-hidden />
      All panels
    </Link>
  );

  if (panelQ.isLoading || tracks.isLoading) {
    return (
      <div>
        {back}
        <ListSkeleton count={3} height="h-28" />
      </div>
    );
  }
  if (panelQ.isError || tracks.isError) {
    return (
      <div>
        {back}
        <QueryError
          message={friendlyError(panelQ.error ?? tracks.error)}
          onRetry={() => {
            void panelQ.refetch();
            void tracks.refetch();
          }}
        />
      </div>
    );
  }
  const panel = panelQ.data;
  if (panel == null) {
    return (
      <div>
        {back}
        <EmptyState icon={FileText} message="This panel was not found. It may have been deleted." />
      </div>
    );
  }

  const track = tracks.data?.find((t) => t.id === panel.trackId);
  const locked = track?.finalizedAt != null;
  const where = venueLine(panel.venue, panel.scheduledAt);
  const members = [...panel.members].sort((a, b) => a.position - b.position);
  const papers = [...panel.papers].sort((a, b) => a.pid.localeCompare(b.pid));
  const hasSubmitted = papers.some((p) => p.evaluations.some((e) => e.submitted));
  const busy = del.isPending || setPanel.isPending || unlock.isPending;

  const runConfirm = (): void => {
    if (confirm == null) return;
    const done = (msg: string) => () => {
      toast.success(msg);
      setConfirm(null);
    };
    const fail = (e: Error): void => {
      toast.error(friendlyError(e));
      setConfirm(null);
    };
    if (confirm.kind === 'delete') {
      del.mutate(panel.id, {
        onSuccess: () => {
          toast.success('Panel deleted');
          setConfirm(null);
          navigate('/panels', { replace: true });
        },
        onError: fail,
      });
    } else if (confirm.kind === 'remove') {
      setPanel.mutate({ paperIds: [confirm.paper.id], panelId: null }, { onSuccess: done('Removed from panel'), onError: fail });
    } else {
      unlock.mutate(confirm.evaluationId, { onSuccess: done('Unlocked'), onError: fail });
    }
  };

  return (
    <div>
      {back}

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold">{panel.name}</h2>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <Chip tone="indigo">{track?.name ?? `Track ${panel.trackId}`}</Chip>
            {locked && (
              <Chip tone="amber" icon={Lock}>
                Finalized
              </Chip>
            )}
            {where !== '' && (
              <Chip tone="gray" icon={MapPin}>
                {where}
              </Chip>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)} disabled={locked}>
            <Pencil size={15} aria-hidden />
            Edit
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setConfirm({ kind: 'delete' })}
            disabled={locked || hasSubmitted}
            title={hasSubmitted ? 'This panel already has submitted scores' : undefined}
            className="text-red-600 dark:text-red-400"
          >
            <Trash2 size={15} aria-hidden />
            Delete
          </Button>
        </div>
      </div>
      {locked && (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
          Results for this track are finalized, so this panel is read-only. The Organizing Chair can reopen the track from Results.
        </p>
      )}

      {/* Members */}
      <h3 className="mb-2 mt-6 text-base font-semibold">Members</h3>
      <div className="grid gap-2 md:grid-cols-2">
        {members.map((m) => (
          <MemberCard key={m.id} member={m} />
        ))}
      </div>

      {/* Papers */}
      <div className="mb-2 mt-6 flex items-center justify-between gap-2">
        <h3 className="text-base font-semibold">Assigned papers ({papers.length})</h3>
        <Button size="sm" onClick={() => setAssignOpen(true)} disabled={locked}>
          <Plus size={16} aria-hidden />
          Assign papers
        </Button>
      </div>
      {papers.length === 0 ? (
        <EmptyState icon={FileText} message="No papers assigned yet. Use “Assign papers” to pick papers from this track." />
      ) : (
        <div className="flex flex-col gap-2">
          {papers.map((p) => (
            <PaperCard
              key={p.id}
              paper={p}
              panel={panel}
              members={members}
              canEdit={!locked}
              isChair={isChair}
              onRemove={() => setConfirm({ kind: 'remove', paper: p })}
              onUnlock={(member, evaluationId) => setConfirm({ kind: 'unlock', paper: p, member, evaluationId })}
            />
          ))}
        </div>
      )}

      <PanelForm open={editOpen} onClose={() => setEditOpen(false)} panel={panel} />
      <AssignPapersSheet open={assignOpen} onClose={() => setAssignOpen(false)} panel={panel} />
      <ConfirmDialog
        open={confirm != null}
        busy={busy}
        onCancel={() => setConfirm(null)}
        onConfirm={runConfirm}
        destructive={confirm?.kind !== 'unlock'}
        title={
          confirm?.kind === 'delete'
            ? 'Delete this panel?'
            : confirm?.kind === 'remove'
              ? `Remove ${confirm.paper.pid} from this panel?`
              : 'Unlock scores?'
        }
        message={
          confirm?.kind === 'delete'
            ? 'Its papers become unassigned and any draft scores are discarded.'
            : confirm?.kind === 'remove'
              ? 'The paper becomes unassigned and any draft scores for it are discarded.'
              : confirm?.kind === 'unlock'
                ? `${confirm.member.name} will be able to change their marks for ${confirm.paper.pid} and must submit again.`
                : ''
        }
        confirmLabel={confirm?.kind === 'delete' ? 'Delete' : confirm?.kind === 'remove' ? 'Remove' : 'Unlock'}
      />
    </div>
  );
}

function MemberCard({ member }: { member: PanelMember }): React.JSX.Element {
  return (
    <Card>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">Member {member.position}</p>
          <p className="truncate font-semibold">{member.name}</p>
          {member.affiliation && <p className="truncate text-sm text-ink-muted">{member.affiliation}</p>}
        </div>
        {member.profileId != null ? (
          <Chip tone="green" icon={CheckCircle2}>
            Signed up
          </Chip>
        ) : (
          <Chip tone="amber" icon={Clock}>
            Not signed up
          </Chip>
        )}
      </div>
      <div className="mt-2 flex flex-col gap-1 text-sm">
        <a href={`mailto:${member.email}`} className="flex min-h-8 items-center gap-1.5 truncate text-primary dark:text-primary">
          <Mail size={14} className="shrink-0" aria-hidden />
          {member.email}
        </a>
        {member.phone && (
          <a href={`tel:${member.phone}`} className="flex min-h-8 items-center gap-1.5 text-primary dark:text-primary">
            <Phone size={14} className="shrink-0" aria-hidden />
            {member.phone}
          </a>
        )}
      </div>
    </Card>
  );
}

function PaperCard({
  paper,
  panel,
  members,
  canEdit,
  isChair,
  onRemove,
  onUnlock,
}: {
  paper: Paper;
  panel: Panel;
  members: PanelMember[];
  canEdit: boolean;
  isChair: boolean;
  onRemove: () => void;
  onUnlock: (member: PanelMember, evaluationId: string) => void;
}): React.JSX.Element {
  const anySubmitted = paper.evaluations.some((e) => e.submitted);
  const presentation = paperPresentation(paper, panel);

  return (
    <Card>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">
             {paper.pid} · {paper.title}
          </p>
          {paper.authors.length > 0 && (
            <p className="mt-0.5 truncate text-sm text-ink-muted">{paper.authors.map((a) => a.name).join(', ')}</p>
          )}
        </div>
        {canEdit && !anySubmitted && (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove ${paper.pid} from panel`}
            title="Remove from panel"
            className="-mr-2 -mt-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-ink-muted hover:bg-muted"
          >
            <X size={18} aria-hidden />
          </button>
        )}
      </div>

      <ul className="mt-3 flex flex-col gap-1.5">
        {members.map((m) => {
          const ev = evaluationOf(paper, m.id);
          return (
            <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="min-w-0 truncate">{m.name}</span>
              <span className="flex items-center gap-1.5">
                {ev == null ? (
                  <Chip tone="gray">Not started</Chip>
                ) : ev.submitted ? (
                  <Chip tone="green" icon={Lock}>
                    Submitted · {evalTotal(ev)}/50
                  </Chip>
                ) : (
                  <Chip tone="amber">Draft · {evalTotal(ev)}/50</Chip>
                )}
                {isChair && canEdit && ev?.submitted === true && (
                  <Button variant="ghost" size="sm" onClick={() => onUnlock(m, ev.id)} title="Unlock so the member can edit">
                    <LockOpen size={15} aria-hidden />
                    Unlock
                  </Button>
                )}
              </span>
            </li>
          );
        })}
      </ul>

      <p className="mt-3 border-t border-line pt-2 text-sm text-ink-muted">
        Presentation: <span className="font-medium text-ink">{fmtScore(presentation)}/50</span> · Review:{' '}
        <span className={`font-medium ${paper.reviewScore == null ? 'text-orange-600 dark:text-orange-400' : 'text-ink'}`}>
          {fmtScore(paper.reviewScore)}/50
        </span>
      </p>
    </Card>
  );
}
