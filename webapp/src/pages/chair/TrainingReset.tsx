import { useState } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { useResetTrainingData } from '../../lib/queries';
import { friendlyError } from '../../lib/api';
import { RESET_CONFIRM_PHRASE, type ResetSummary } from '../../lib/types';
import { useToast } from '../../components/Toast';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Field, Input } from '../../components/Field';

/**
 * Training reset: clears everything an event produces so the same database can
 * be rehearsed on and then handed back clean.
 *
 * Only reachable by a user the Organizing Chair has granted `can_reset_data`;
 * the RPC re-checks that flag and the confirmation phrase on the server.
 */
export default function TrainingReset() {
  const toast = useToast();
  const reset = useResetTrainingData();
  const [phrase, setPhrase] = useState('');
  const [result, setResult] = useState<ResetSummary | null>(null);

  const armed = phrase.trim().toUpperCase() === RESET_CONFIRM_PHRASE;

  const run = () => {
    setResult(null);
    reset.mutate(RESET_CONFIRM_PHRASE, {
      onSuccess: (summary) => {
        setPhrase('');
        setResult(summary);
        toast.success('Event data reset.');
      },
      onError: (err) => toast.error(friendlyError(err)),
    });
  };

  return (
    <div className="max-w-2xl">
      <Card className="mb-4 flex gap-3 border border-red-500/40 p-4">
        <AlertTriangle size={20} className="mt-0.5 shrink-0 text-red-600 dark:text-red-400" />
        <div className="text-sm text-ink-muted">
          <p className="font-medium text-ink">This clears the whole event, for every track.</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>All evaluations and marks are deleted — every paper goes back to unmarked.</li>
            <li>All panels and their panel members are deleted.</li>
            <li>Review scores are cleared from every paper.</li>
            <li>Finalized results are discarded and all tracks are reopened.</li>
          </ul>
          <p className="mt-2">
            Papers, authors and staff accounts are kept. There is no undo — the data is gone, not
            archived.
          </p>
        </div>
      </Card>

      <Card className="p-4">
        <Field
          label={`Type ${RESET_CONFIRM_PHRASE} to enable the button`}
          required
        >
          <Input
            value={phrase}
            onChange={(e) => setPhrase(e.target.value)}
            placeholder={RESET_CONFIRM_PHRASE}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            aria-label={`Type ${RESET_CONFIRM_PHRASE} to confirm`}
          />
        </Field>
        <div className="mt-4 flex justify-end">
          <Button variant="danger" disabled={!armed} loading={reset.isPending} onClick={run}>
            <RotateCcw size={16} />
            Reset all event data
          </Button>
        </div>
      </Card>

      {result != null && (
        <Card className="mt-4 p-4">
          <p className="text-sm font-medium text-ink">Reset complete</p>
          <ul className="mt-2 space-y-1 text-sm text-ink-muted">
            <li>{result.evaluations} evaluation{result.evaluations === 1 ? '' : 's'} deleted</li>
            <li>
              {result.panels} panel{result.panels === 1 ? '' : 's'} and {result.panelMembers} panel
              member{result.panelMembers === 1 ? '' : 's'} deleted
            </li>
            <li>{result.reviewScores} review score{result.reviewScores === 1 ? '' : 's'} cleared</li>
            <li>{result.tracksReopened} track{result.tracksReopened === 1 ? '' : 's'} reopened</li>
          </ul>
        </Card>
      )}
    </div>
  );
}
