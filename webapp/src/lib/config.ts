// Backend configuration: the app runs against Supabase.

function env(name: string): string {
  return (import.meta.env[name] ?? '').trim();
}

export const supabaseUrl = env('VITE_SUPABASE_URL');
export const supabasePublishableKey = env('VITE_SUPABASE_PUBLISHABLE_KEY');
