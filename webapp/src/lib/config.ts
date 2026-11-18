// Mode selection: the app runs against Supabase when a URL is configured,
// otherwise (or when VITE_DEMO === 'true') it runs on in-memory sample data.

function env(name: string): string {
  return (import.meta.env[name] ?? '').trim();
}

export const supabaseUrl = env('VITE_SUPABASE_URL');
export const supabasePublishableKey = env('VITE_SUPABASE_PUBLISHABLE_KEY');

/** Demo if VITE_DEMO === 'true' OR VITE_SUPABASE_URL is missing. */
export const isDemo: boolean = env('VITE_DEMO') === 'true' || supabaseUrl === '';
