// Auto-reload on new deploy.
//
// This is a PWA with no service worker, so an already-open tab keeps running
// the JavaScript it loaded at launch. After a deploy that old code can hit the
// new database shape and throw (e.g. "column authors.email does not exist").
//
// At build time Vite stamps a unique __BUILD_ID__ into the bundle and emits a
// matching /version.json (served no-cache). We poll it; when the deployed id no
// longer matches the one we are running, we reload to pick up the new bundle.
// A content-hashed bundle plus a no-cache index.html means a plain reload is
// enough — nothing else to clear.

import { useEffect } from 'react';

declare const __BUILD_ID__: string;

async function fetchDeployedId(): Promise<string | null> {
  try {
    const res = await fetch(`/version.json?cb=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const data = (await res.json()) as { buildId?: string };
    return typeof data.buildId === 'string' && data.buildId !== '' ? data.buildId : null;
  } catch {
    // Offline, blocked, or mid-deploy: ignore and try again next tick.
    return null;
  }
}

/** True while the user is typing, so a reload would discard their input. */
function isEditing(): boolean {
  const el = document.activeElement as HTMLElement | null;
  if (el == null) return false;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable === true;
}

export function useAutoReload(): void {
  useEffect(() => {
    const current = __BUILD_ID__;
    let stopped = false;
    let reloading = false;

    const check = async (): Promise<void> => {
      if (stopped || reloading) return;
      const deployed = await fetchDeployedId();
      if (deployed == null || deployed === current) return;
      // A new version is live. Hold off while they are actively typing; the
      // next poll / focus will catch them once they stop.
      if (isEditing()) return;
      reloading = true;
      window.location.reload();
    };

    const onVisible = (): void => {
      if (document.visibilityState === 'visible') void check();
    };

    const id = window.setInterval(() => void check(), 60_000);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    void check();

    return () => {
      stopped = true;
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, []);
}

/** Mount once near the app root; renders nothing. */
export function AutoReload(): null {
  useAutoReload();
  return null;
}
