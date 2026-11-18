import { isDemo } from '../lib/config';

/** Thin amber strip shown at the top in demo mode. */
export function DemoBanner(): React.JSX.Element | null {
  if (!isDemo) return null;
  return (
    <div className="w-full bg-amber-400 px-3 py-1 text-center text-xs font-semibold text-black">
      DEMO MODE — sample data, nothing is saved (resets on reload)
    </div>
  );
}
