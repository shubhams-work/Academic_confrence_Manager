import { Hourglass } from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { friendlyError } from '../../lib/api';
import { Button } from '../../components/Button';

/** Shown when a signed-in user has no role (email not invited / not on a panel). */
export default function NotAuthorized(): React.JSX.Element {
  const auth = useAuth();
  return (
    <div className="flex min-h-dvh items-center justify-center bg-page p-6 text-ink">
      <div className="max-w-md text-center">
        <Hourglass size={56} className="mx-auto text-primary" aria-hidden />
        <h1 className="mt-4 text-2xl font-semibold">Waiting for access</h1>
        <p className="mt-3 text-sm leading-relaxed text-ink-muted">
          You are signed in as {auth.email}, but this email is not linked to a panel or a staff role yet.
          <br />
          <br />
          Ask your Session Incharge (panel members) or the Organizing Chair (staff) to add exactly this email
          address, then tap &ldquo;Check again&rdquo;.
        </p>
        {auth.error != null && (
          <p className="mt-4 text-sm text-red-600 dark:text-red-400">{friendlyError(auth.error)}</p>
        )}
        <div className="mt-6 flex flex-col items-center gap-2">
          <Button onClick={() => void auth.refreshProfile()}>Check again</Button>
          <Button variant="ghost" onClick={() => void auth.signOut()}>
            Sign out
          </Button>
        </div>
      </div>
    </div>
  );
}
