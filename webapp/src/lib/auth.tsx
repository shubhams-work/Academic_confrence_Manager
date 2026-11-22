// Signed-in state + profile (role). The router listens to this to redirect
// between login / role home screens.
// Port of ../lib/core/auth_controller.dart (incl. ?token_hash=&type=
// email-link handling via supabase.auth.verifyOtp).

import {
  createContext,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import type { Session } from '@supabase/supabase-js';
import type { AppRole, Profile } from './types';
import { getApi } from './api';
import { getSupabase } from './supabaseApi';

export interface AuthSnapshot {
  loading: boolean;
  signedIn: boolean;
  email: string | null;
  profile: Profile | null;
  role: AppRole | null;
  recoveringPassword: boolean;
  error: unknown;
  /** One-off message for the login screen (e.g. "Email confirmed"). */
  notice: string | null;
}

export interface AuthController {
  subscribe(cb: () => void): () => void;
  getSnapshot(): AuthSnapshot;
  signIn(email: string, password: string): Promise<void>;
  sendPasswordReset(email: string): Promise<void>;
  setNewPassword(password: string): Promise<void>;
  signOut(): Promise<void>;
  refreshProfile(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Supabase implementation

class SupabaseAuthController implements AuthController {
  private session: Session | null = null;
  private profile: Profile | null = null;
  private loading = true;
  private recovering = false;
  private error: unknown = null;
  private notice: string | null = null;
  private listeners = new Set<() => void>();
  private snap: AuthSnapshot;
  private subscription: { unsubscribe: () => void };

  constructor() {
    this.snap = this.build();
    // Supabase warns against calling other supabase methods inside this
    // callback (it can deadlock on the auth lock), so defer the profile load.
    this.subscription = getSupabase().auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') this.recovering = true;
      window.setTimeout(() => void this.onSession(session), 0);
    }).data.subscription;
    void getSupabase()
      .auth.getSession()
      .then(({ data }) => this.onSession(data.session));
    void this.handleEmailLink();
  }

  private build(): AuthSnapshot {
    return {
      loading: this.loading,
      signedIn: this.session != null,
      email: this.session?.user?.email ?? null,
      profile: this.profile,
      role: this.profile?.role ?? null,
      recoveringPassword: this.recovering || this.needsPassword(),
      error: this.error,
      notice: this.notice,
    };
  }

  /**
   * True when this account has never had a password set on it.
   *
   * `recovering` alone is not enough to gate the reset screen: it lives in
   * memory, while verifyOtp has already written a real session to storage. A
   * reload or an edited URL would therefore drop the gate and leave an invited
   * user inside the app with no password - unable to sign in ever again, since
   * there is nothing to type. inviteUserByEmail stamps password_set: false on
   * the account, setNewPassword flips it to true, and auth.users is the one
   * place a reload cannot clear.
   *
   * Accounts that predate this (the first Chair, anyone already signed up)
   * have no such key at all, so `=== false` deliberately leaves them alone.
   */
  private needsPassword(): boolean {
    const meta = this.session?.user?.user_metadata as { password_set?: unknown } | undefined;
    return meta?.password_set === false;
  }

  private notify(): void {
    this.snap = this.build();
    for (const l of this.listeners) l();
  }

  subscribe = (cb: () => void): (() => void) => {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  };

  getSnapshot = (): AuthSnapshot => this.snap;

  /** Handles links from Supabase emails: `?token_hash=…&type=invite|recovery|email`. */
  private async handleEmailLink(): Promise<void> {
    const params = new URLSearchParams(window.location.search);
    const hash = params.get('token_hash');
    const type = params.get('type');
    if (!hash || !type) return;
    const otpType: 'recovery' | 'invite' | 'signup' | 'email' =
      type === 'recovery'
        ? 'recovery'
        : type === 'invite'
          ? 'invite'
          : type === 'signup'
            ? 'signup'
            : 'email';
    // An invited account has no password yet, so it needs the same forced
    // "Set a new password" detour as a recovery link — otherwise the one-time
    // invite link expires and the account can never be signed into.
    const needsPassword = otpType === 'recovery' || otpType === 'invite';
    if (needsPassword) this.recovering = true;
    const { error } = await getSupabase().auth.verifyOtp({ token_hash: hash, type: otpType });
    if (error) {
      this.recovering = false;
      this.notice = 'This link is invalid or has expired. Please sign in, or request a new link.';
    } else if (!needsPassword) {
      this.notice = 'Email confirmed — you are signed in.';
    }
    // Drop the one-time token from the address bar.
    window.history.replaceState(null, '', window.location.pathname);
    this.notify();
  }

  private async onSession(s: Session | null): Promise<void> {
    const sameUser = (s?.user?.id ?? null) === (this.session?.user?.id ?? null);
    this.session = s;
    if (s == null) {
      this.profile = null;
      this.loading = false;
      this.notify();
      return;
    }
    if (sameUser && this.profile != null) return;
    await this.refreshProfile();
  }

  async refreshProfile(): Promise<void> {
    const s = this.session;
    if (!s) return;
    this.loading = true;
    this.notify();
    try {
      this.profile = await getApi().profile(s.user.id);
      this.error = null;
    } catch (e) {
      this.error = e;
    }
    this.loading = false;
    this.notify();
  }

  async signIn(email: string, password: string): Promise<void> {
    this.notice = null;
    const { error } = await getSupabase().auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    if (error) throw new Error(authMessage(error.message));
  }

  async sendPasswordReset(email: string): Promise<void> {
    const { error } = await getSupabase().auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: window.location.origin,
    });
    if (error) throw new Error(authMessage(error.message));
  }

  async setNewPassword(password: string): Promise<void> {
    // The data flag is what releases the gate above, so it has to be written
    // in the same call that sets the password - never in a follow-up that
    // could fail on its own and strand the account.
    const { data, error } = await getSupabase().auth.updateUser({
      password,
      data: { password_set: true },
    });
    if (error) throw new Error(authMessage(error.message));
    if (data.user != null && this.session != null) {
      this.session = { ...this.session, user: data.user };
    }
    this.recovering = false;
    this.notify();
  }

  async signOut(): Promise<void> {
    this.recovering = false;
    await getSupabase().auth.signOut();
  }

  dispose(): void {
    this.subscription.unsubscribe();
  }
}

/** Friendlier wording for the common Supabase Auth errors. */
function authMessage(m: string): string {
  if (/invalid login credentials/i.test(m)) return 'Wrong email or password.';
  if (/email not confirmed/i.test(m)) return 'Please confirm your email first — open the link we sent you.';
  if (/rate limit|too many/i.test(m)) return 'Too many attempts. Please wait a minute and try again.';
  return m;
}

// ---------------------------------------------------------------------------
// React integration

const AuthCtx = createContext<AuthController | null>(null);

export function AuthProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const ctrl = useMemo<AuthController>(() => new SupabaseAuthController(), []);
  return <AuthCtx.Provider value={ctrl}>{children}</AuthCtx.Provider>;
}

export interface Auth extends AuthSnapshot {
  signIn(email: string, password: string): Promise<void>;
  sendPasswordReset(email: string): Promise<void>;
  setNewPassword(password: string): Promise<void>;
  signOut(): Promise<void>;
  refreshProfile(): Promise<void>;
}

export function useAuth(): Auth {
  const ctrl = useContext(AuthCtx);
  if (!ctrl) throw new Error('useAuth must be used inside <AuthProvider>');
  const subscribe = useMemo(() => ctrl.subscribe.bind(ctrl), [ctrl]);
  const getSnapshot = useMemo(() => ctrl.getSnapshot.bind(ctrl), [ctrl]);
  const snap = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return useMemo<Auth>(
    () => ({
      ...snap,
      signIn: (email: string, password: string) => ctrl.signIn(email, password),
      sendPasswordReset: (email: string) => ctrl.sendPasswordReset(email),
      setNewPassword: (password: string) => ctrl.setNewPassword(password),
      signOut: () => ctrl.signOut(),
      refreshProfile: () => ctrl.refreshProfile(),
    }),
    [snap, ctrl],
  );
}
