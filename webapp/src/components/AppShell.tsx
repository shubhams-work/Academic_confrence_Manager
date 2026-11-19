import { useState, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { CircleUserRound, LogOut, RefreshCw } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { roleLabel } from '../lib/types';
import type { Destination } from '../router';

interface AppShellProps {
  nav: Destination[];
  children: ReactNode;
}

/**
 * Role-based app frame: sticky top bar (title, refresh, account menu),
 * bottom tab bar on phones, left sidebar on ≥768px.
 */
export function AppShell({ nav, children }: AppShellProps): React.JSX.Element {
  const auth = useAuth();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const showNav = nav.length > 1;

  const current =
    nav.find((d) => location.pathname === d.path || location.pathname.startsWith(d.path + '/')) ?? null;
  const title = current?.label ?? 'COSMIC · Conference Evaluation';

  async function refresh(): Promise<void> {
    setRefreshing(true);
    try {
      await queryClient.invalidateQueries();
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="flex min-h-dvh bg-page text-ink">
      {showNav && (
        <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col gap-1 border-r border-line bg-surface p-3 md:flex">
          <div className="mb-3 flex items-center gap-3 px-2 py-2">
            <img
              src="/COSMIC-LOGO.png"
              alt="COSMIC"
              className="h-10 w-10 shrink-0 rounded-full ring-1 ring-primary/40"
            />
            <div className="min-w-0 leading-tight">
              <div className="truncate text-sm font-bold cosmic-gradient-text">COSMIC 2026</div>
              <div className="truncate text-[11px] text-ink-muted">Conference Evaluation</div>
            </div>
          </div>
          {nav.map((d) => (
            <NavLink
              key={d.path}
              to={d.path}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-primary/15 text-primary ring-1 ring-primary/30'
                    : 'text-ink hover:bg-primary/5 hover:text-primary'
                }`
              }
            >
              <d.icon size={18} aria-hidden />
              {d.label}
            </NavLink>
          ))}
          <div className="mt-auto rounded-lg border border-line bg-surface-2 px-3 py-2 text-xs text-ink-muted">
            <div className="truncate font-medium text-ink">{auth.profile?.fullName || auth.email}</div>
            {auth.role != null && <div className="mt-0.5 truncate">{roleLabel[auth.role]}</div>}
          </div>
        </aside>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-line bg-surface/90 backdrop-blur">
          <div className="mx-auto flex h-14 w-full max-w-[1100px] items-center gap-2 px-4">
            {!showNav && (
              <img
                src="/COSMIC-LOGO.png"
                alt="COSMIC"
                className="h-8 w-8 rounded-full ring-1 ring-primary/40"
              />
            )}
            <h1 className="truncate text-lg font-semibold tracking-tight">{title}</h1>
            <div className="flex-1" />
            <button
              type="button"
              aria-label="Refresh"
              title="Refresh"
              onClick={() => void refresh()}
              className="flex h-11 w-11 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-primary/10 hover:text-primary"
            >
              <RefreshCw size={19} className={refreshing ? 'animate-spin' : ''} aria-hidden />
            </button>
            <AccountMenu />
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1100px] flex-1 p-4 pb-24 md:pb-8">{children}</main>
      </div>

      {showNav && (
        <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
          <div className="grid" style={{ gridTemplateColumns: `repeat(${nav.length}, minmax(0, 1fr))` }}>
            {nav.map((d) => (
              <NavLink
                key={d.path}
                to={d.path}
                className={({ isActive }) =>
                  `flex h-16 flex-col items-center justify-start gap-1 px-1 pt-2 text-center text-[11px] font-medium leading-tight transition-colors ${
                    isActive ? 'text-primary' : 'text-ink-muted hover:text-primary'
                  }`
                }
              >
                <d.icon size={20} className="shrink-0" aria-hidden />
                <span className="line-clamp-2">{d.label}</span>
              </NavLink>
            ))}
          </div>
        </nav>
      )}
    </div>
  );
}

/** Attribution, shown on the login screen. */
export function AppFooter(): React.JSX.Element {
  return (
    <footer className="mx-auto w-full max-w-[1100px] px-4 pb-4 pt-8">
      <div className="border-t border-line pt-4 text-center text-xs leading-relaxed text-ink-muted">
        <p>Developed by CoE Cybersecurity and Dept of CSE, SCEM</p>
        <p className="mt-0.5">Powered by Sahynex Innovations</p>
      </div>
    </footer>
  );
}

/** App-bar menu with the user's name/role and Sign out. */
export function AccountMenu(): React.JSX.Element {
  const auth = useAuth();
  const [open, setOpen] = useState(false);
  const name = auth.profile?.fullName || auth.email || '';

  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Account"
        onClick={() => setOpen((v) => !v)}
        className="flex h-11 w-11 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-primary/10 hover:text-primary"
      >
        <CircleUserRound size={22} aria-hidden />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute right-0 top-12 z-20 w-64 rounded-xl border border-line bg-surface p-3 shadow-xl shadow-black/20">
            <div className="truncate text-sm font-semibold">{name}</div>
            <div className="mt-0.5 truncate text-xs text-ink-muted">
              {auth.email}
              {auth.role != null ? ` · ${roleLabel[auth.role]}` : ''}
            </div>
            <hr className="my-2 border-line" />
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                void auth.signOut();
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-2.5 text-sm text-ink transition-colors hover:bg-primary/10 hover:text-primary"
            >
              <LogOut size={16} aria-hidden />
              Sign out
            </button>
          </div>
        </>
      )}
    </div>
  );
}
