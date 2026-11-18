import { useState } from 'react';
import { Eye, EyeOff, Info } from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { friendlyError } from '../../lib/api';
import { Button } from '../../components/Button';
import { Field, Input } from '../../components/Field';
import { Sheet } from '../../components/Sheet';
import { useToast } from '../../components/Toast';

const emailRe = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

interface FieldErrors {
  email?: string;
  password?: string;
}

export default function Login(): React.JSX.Element {
  const auth = useAuth();
  const { toast } = useToast();

  const [busy, setBusy] = useState(false);
  const [obscure, setObscure] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotBusy, setForgotBusy] = useState(false);

  function validate(): boolean {
    const e: FieldErrors = {};
    if (email.trim() === '') e.email = 'Email is required';
    else if (!emailRe.test(email.trim())) e.email = 'Enter a valid email';
    if (password === '') e.password = 'Password is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function submit(ev: React.FormEvent): Promise<void> {
    ev.preventDefault();
    if (!validate()) return;
    setBusy(true);
    try {
      await auth.signIn(email, password);
    } catch (err) {
      toast(friendlyError(err), { error: true });
    } finally {
      setBusy(false);
    }
  }

  async function sendReset(): Promise<void> {
    const e = forgotEmail.trim();
    if (e === '' || !emailRe.test(e)) {
      toast('Enter a valid email', { error: true });
      return;
    }
    setForgotBusy(true);
    try {
      await auth.sendPasswordReset(e);
      setForgotOpen(false);
      toast('If that email has an account, a reset link is on its way.');
    } catch (err) {
      toast(friendlyError(err), { error: true });
    } finally {
      setForgotBusy(false);
    }
  }

  return (
    <div className="cosmic-hero flex min-h-dvh items-center justify-center p-6 text-ink">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center text-center">
          <img
            src="/COSMIC-LOGO.png"
            alt="COSMIC 2026"
            className="h-28 w-28 rounded-full shadow-lg shadow-black/30 ring-1 ring-primary/40"
          />
          <h1 className="mt-5 text-3xl font-bold tracking-tight md:text-4xl">
            <span className="cosmic-gradient-text">COSMIC &middot; 2026</span>
          </h1>
          <p className="mt-2 max-w-sm text-sm text-ink-muted">
            Third International Conference on Computing, Semiconductor, Mechatronics,
            Intelligent Systems and Communications
          </p>
          <p className="mt-3 text-xs font-semibold uppercase tracking-[0.2em] text-primary">
            Conference Evaluation Portal
          </p>
        </div>

        {auth.notice != null && (
          <div className="mt-5 flex items-start gap-2 rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-800 dark:border-sky-500/40 dark:bg-sky-500/10 dark:text-sky-200">
            <Info size={16} className="mt-0.5 shrink-0" aria-hidden />
            <span>{auth.notice}</span>
          </div>
        )}
        <div className="mt-6 rounded-2xl border border-line bg-surface/80 p-5 shadow-xl shadow-black/10 backdrop-blur">
          <p className="mb-4 text-center text-sm text-ink-muted">Sign in to continue</p>

          <form onSubmit={(ev) => void submit(ev)} className="mt-5 space-y-4" noValidate>
            <Field label="Email" required error={errors.email}>
              <Input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="you@example.edu"
              />
            </Field>
            <Field label="Password" required error={errors.password}>
              <div className="relative">
                <Input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type={obscure ? 'password' : 'text'}
                  autoComplete="current-password"
                  className="pr-12"
                />
                <button
                  type="button"
                  aria-label={obscure ? 'Show password' : 'Hide password'}
                  onClick={() => setObscure((v) => !v)}
                  className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-lg text-ink-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
                >
                  {obscure ? <Eye size={18} aria-hidden /> : <EyeOff size={18} aria-hidden />}
                </button>
              </div>
            </Field>

            <Button type="submit" loading={busy} className="w-full min-h-12">
              Sign in
            </Button>
          </form>

          <button
            type="button"
            onClick={() => {
              setForgotEmail(email);
              setForgotOpen(true);
            }}
            className="mt-3 min-h-11 w-full rounded-lg py-2 text-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            Forgot password?
          </button>
        </div>
      </div>

      {/* Forgot-password dialog */}
      <Sheet open={forgotOpen} onClose={() => setForgotOpen(false)} title="Reset password">
        <Field label="Email" hint="We will send a reset link to this address.">
          <Input
            value={forgotEmail}
            onChange={(e) => setForgotEmail(e.target.value)}
            type="email"
            inputMode="email"
            autoComplete="email"
          />
        </Field>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setForgotOpen(false)} disabled={forgotBusy}>
            Cancel
          </Button>
          <Button loading={forgotBusy} onClick={() => void sendReset()}>
            Send link
          </Button>
        </div>
      </Sheet>
    </div>
  );
}
