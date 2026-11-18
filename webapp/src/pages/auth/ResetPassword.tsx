import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../../lib/auth';
import { friendlyError } from '../../lib/api';
import { Button } from '../../components/Button';
import { Field, Input } from '../../components/Field';
import { useToast } from '../../components/Toast';

/** Reached from the password-reset email link. */
export default function ResetPassword(): React.JSX.Element {
  const auth = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [p1, setP1] = useState('');
  const [p2, setP2] = useState('');
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<{ p1?: string; p2?: string }>({});

  async function save(ev: React.FormEvent): Promise<void> {
    ev.preventDefault();
    const e: { p1?: string; p2?: string } = {};
    if (p1.length < 8) e.p1 = 'Use at least 8 characters';
    if (p2 !== p1) e.p2 = 'Passwords do not match';
    setErrors(e);
    if (e.p1 != null || e.p2 != null) return;

    setBusy(true);
    try {
      await auth.setNewPassword(p1);
      toast('Password updated');
      navigate(auth.role != null ? '/' : '/not-authorized', { replace: true });
    } catch (err) {
      toast(friendlyError(err), { error: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-page p-6 text-ink">
      <form onSubmit={(ev) => void save(ev)} className="w-full max-w-md" noValidate>
        <h1 className="text-center text-2xl font-semibold">Set a new password</h1>
        <div className="mt-6 space-y-4">
          <Field label="New password" error={errors.p1}>
            <Input
              value={p1}
              onChange={(e) => setP1(e.target.value)}
              type="password"
              autoComplete="new-password"
            />
          </Field>
          <Field label="Repeat password" error={errors.p2}>
            <Input
              value={p2}
              onChange={(e) => setP2(e.target.value)}
              type="password"
              autoComplete="new-password"
            />
          </Field>
        </div>
        <Button type="submit" loading={busy} className="mt-6 w-full">
          Save password
        </Button>
      </form>
    </div>
  );
}
