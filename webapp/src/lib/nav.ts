// Role-based navigation (port of the destinations in lib/app.dart).

import { BarChart3, ClipboardCheck, FileText, ShieldCheck, Upload, Users } from 'lucide-react';
import type { ComponentType } from 'react';
import type { AppRole } from './types';

export type NavIcon = ComponentType<{ size?: number | string; className?: string }>;

export interface Destination {
  path: string;
  label: string;
  icon: NavIcon;
}

const chairNav: Destination[] = [
  { path: '/papers', label: 'Papers', icon: FileText },
  { path: '/import', label: 'Import', icon: Upload },
  { path: '/panels', label: 'Panels', icon: Users },
  { path: '/results', label: 'Results', icon: BarChart3 },
  { path: '/staff', label: 'Staff', icon: ShieldCheck },
];

const inchargeNav: Destination[] = [
  { path: '/panels', label: 'Panels', icon: Users },
  { path: '/results', label: 'Results', icon: BarChart3 },
];

const memberNav: Destination[] = [{ path: '/my-papers', label: 'My Papers', icon: ClipboardCheck }];

export function navFor(role: AppRole): Destination[] {
  switch (role) {
    case 'organizing_chair':
      return chairNav;
    case 'session_incharge':
      return inchargeNav;
    case 'panel_member':
      return memberNav;
  }
}

export function homeFor(role: AppRole): string {
  return navFor(role)[0]?.path ?? '/login';
}

export function pathAllowed(role: AppRole, path: string): boolean {
  return navFor(role).some((d) => path === d.path || path.startsWith(`${d.path}/`));
}
