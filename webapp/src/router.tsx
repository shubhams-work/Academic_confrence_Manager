// Routes, role guard and lazy pages. Port of ../lib/app.dart routing logic.

import { Suspense, lazy, type ReactNode } from 'react';
import { Navigate, Outlet, createBrowserRouter, RouterProvider, useLocation, useRouteError, type RouteObject } from 'react-router';
import type { LucideIcon } from 'lucide-react';
import { ClipboardCheck, FileText, RotateCcw, Trophy, Upload, UserCog, UserPlus, Users } from 'lucide-react';
import type { AppRole } from './lib/types';
import { useAuth } from './lib/auth';
import { AppShell } from './components/AppShell';
import { PageSpinner } from './components/Spinner';

// ---------- Role navigation ----------

export interface Destination {
  path: string;
  label: string;
  icon: LucideIcon;
}

const chairNav: Destination[] = [
  { path: '/papers', label: 'Papers', icon: FileText },
  { path: '/import', label: 'Review scores', icon: Upload },
  { path: '/panels', label: 'Panels', icon: Users },
  { path: '/members', label: 'Panelists', icon: UserPlus },
  { path: '/results', label: 'Results', icon: Trophy },
  { path: '/staff', label: 'Session I.C', icon: UserCog },
];

// Scores are chair-only, so the incharge has no Results tab (the route guard
// also redirects them away from /results if reached directly).
const inchargeNav: Destination[] = [
  { path: '/panels', label: 'Panels', icon: Users },
  { path: '/members', label: 'Panelists', icon: UserPlus },
];

const memberNav: Destination[] = [{ path: '/my-papers', label: 'My Papers', icon: ClipboardCheck }];

// Only shown while the Organizing Chair has granted profiles.can_reset_data.
const trainingReset: Destination = { path: '/training-reset', label: 'Reset', icon: RotateCcw };

export function navFor(role: AppRole, canResetData = false): Destination[] {
  const base = (() => {
    switch (role) {
      case 'organizing_chair':
        return chairNav;
      case 'session_incharge':
        return inchargeNav;
      case 'panel_member':
        return memberNav;
    }
  })();
  return canResetData ? [...base, trainingReset] : base;
}

export function homeFor(role: AppRole): string {
  return navFor(role)[0]!.path;
}

function allowed(role: AppRole, path: string, canResetData: boolean): boolean {
  return navFor(role, canResetData).some((d) => path === d.path || path.startsWith(d.path + '/'));
}

// ---------- Lazy pages ----------

const Login = lazy(() => import('./pages/auth/Login'));
const NotAuthorized = lazy(() => import('./pages/auth/NotAuthorized'));
const ResetPassword = lazy(() => import('./pages/auth/ResetPassword'));
const Papers = lazy(() => import('./pages/chair/Papers'));
const PaperForm = lazy(() => import('./pages/chair/PaperForm'));
const Import = lazy(() => import('./pages/chair/Import'));
const PaperImport = lazy(() => import('./pages/chair/PaperImport'));
const Staff = lazy(() => import('./pages/chair/Staff'));
const Panels = lazy(() => import('./pages/panels/Panels'));
const PanelDetail = lazy(() => import('./pages/panels/PanelDetail'));
const Members = lazy(() => import('./pages/panels/Members'));
const MyPapers = lazy(() => import('./pages/member/MyPapers'));
const Score = lazy(() => import('./pages/member/Score'));
const Results = lazy(() => import('./pages/results/Results'));
const TrainingReset = lazy(() => import('./pages/chair/TrainingReset'));

function LazyPage({ children }: { children: ReactNode }): React.JSX.Element {
  return <Suspense fallback={<PageSpinner />}>{children}</Suspense>;
}

// ---------- Error screen ----------

/** Shown instead of a blank page if a screen crashes. */
function RouteError(): React.JSX.Element {
  const err = useRouteError();
  const message = err instanceof Error ? err.message : String(err);
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-page p-6 text-center">
      <h1 className="text-lg font-semibold text-ink">Something went wrong</h1>
      <p className="max-w-md text-sm text-ink-muted">{message}</p>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="h-11 rounded-lg bg-primary px-4 font-medium text-primary-fg"
        >
          Reload
        </button>
        <a href="/" className="flex h-11 items-center rounded-lg border border-line px-4 font-medium text-ink">
          Home
        </a>
      </div>
    </div>
  );
}

// ---------- Guards ----------

function RootLayout(): React.JSX.Element {
  return <Outlet />;
}

function RootRedirect(): React.JSX.Element {
  const auth = useAuth();
  if (auth.loading) return <PageSpinner />;
  if (!auth.signedIn) return <Navigate to="/login" replace />;
  if (auth.recoveringPassword) return <Navigate to="/reset-password" replace />;
  if (auth.role == null) return <Navigate to="/not-authorized" replace />;
  return <Navigate to={homeFor(auth.role)} replace />;
}

function LoginRoute(): React.JSX.Element {
  const auth = useAuth();
  if (auth.loading) return <PageSpinner />;
  if (auth.signedIn) {
    if (auth.recoveringPassword) return <Navigate to="/reset-password" replace />;
    if (auth.role != null) return <Navigate to={homeFor(auth.role)} replace />;
    return <Navigate to="/not-authorized" replace />;
  }
  return (
    <LazyPage>
      <Login />
    </LazyPage>
  );
}

function ResetPasswordRoute(): React.JSX.Element {
  const auth = useAuth();
  if (auth.loading) return <PageSpinner />;
  if (!auth.signedIn) return <Navigate to="/login" replace />;
  if (!auth.recoveringPassword) {
    return <Navigate to={auth.role != null ? homeFor(auth.role) : '/not-authorized'} replace />;
  }
  return (
    <LazyPage>
      <ResetPassword />
    </LazyPage>
  );
}

function NotAuthorizedRoute(): React.JSX.Element {
  const auth = useAuth();
  if (auth.loading) return <PageSpinner />;
  if (!auth.signedIn) return <Navigate to="/login" replace />;
  if (auth.role != null) return <Navigate to={homeFor(auth.role)} replace />;
  return (
    <LazyPage>
      <NotAuthorized />
    </LazyPage>
  );
}

/**
 * Guards the app shell: signed in, authorized, and on a URL the role can use
 * (otherwise redirect to the role's home).
 */
function ShellRoute(): React.JSX.Element {
  const auth = useAuth();
  const location = useLocation();
  if (auth.loading) return <PageSpinner />;
  if (!auth.signedIn) return <Navigate to="/login" replace />;
  if (auth.recoveringPassword) return <Navigate to="/reset-password" replace />;
  if (auth.role == null) return <Navigate to="/not-authorized" replace />;
  const canResetData = auth.profile?.canResetData === true;
  if (!allowed(auth.role, location.pathname, canResetData)) {
    return <Navigate to={homeFor(auth.role)} replace />;
  }
  return (
    <AppShell nav={navFor(auth.role, canResetData)}>
      <Outlet />
    </AppShell>
  );
}

// ---------- Router ----------

export const routes: RouteObject[] = [
  {
    element: <RootLayout />,
    errorElement: <RouteError />,
    children: [
      { path: '/', element: <RootRedirect /> },
      { path: '/login', element: <LoginRoute /> },
      { path: '/reset-password', element: <ResetPasswordRoute /> },
      { path: '/not-authorized', element: <NotAuthorizedRoute /> },
      {
        element: <ShellRoute />,
        children: [
          {
            path: '/papers',
            element: (
              <LazyPage>
                <Papers />
              </LazyPage>
            ),
          },
          {
            path: '/papers/new',
            element: (
              <LazyPage>
                <PaperForm />
              </LazyPage>
            ),
          },
          {
            path: '/papers/import',
            element: (
              <LazyPage>
                <PaperImport />
              </LazyPage>
            ),
          },
          {
            path: '/papers/:id/edit',
            element: (
              <LazyPage>
                <PaperForm />
              </LazyPage>
            ),
          },
          {
            path: '/import',
            element: (
              <LazyPage>
                <Import />
              </LazyPage>
            ),
          },
          {
            path: '/staff',
            element: (
              <LazyPage>
                <Staff />
              </LazyPage>
            ),
          },
          {
            path: '/panels',
            element: (
              <LazyPage>
                <Panels />
              </LazyPage>
            ),
          },
          {
            path: '/panels/:id',
            element: (
              <LazyPage>
                <PanelDetail />
              </LazyPage>
            ),
          },
          {
            path: '/members',
            element: (
              <LazyPage>
                <Members />
              </LazyPage>
            ),
          },
          {
            path: '/results',
            element: (
              <LazyPage>
                <Results />
              </LazyPage>
            ),
          },
          {
            path: '/training-reset',
            element: (
              <LazyPage>
                <TrainingReset />
              </LazyPage>
            ),
          },
          {
            path: '/my-papers',
            element: (
              <LazyPage>
                <MyPapers />
              </LazyPage>
            ),
          },
          {
            path: '/my-papers/:paperId',
            element: (
              <LazyPage>
                <Score />
              </LazyPage>
            ),
          },
        ],
      },
    ],
  },
];

export const router = createBrowserRouter(routes);

export function AppRouter(): React.JSX.Element {
  return <RouterProvider router={router} />;
}
