/// <reference types="vite/client" />

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// A syntactically valid (but non-functional) placeholder so the client can
// initialize without throwing when no environment is configured. Without
// this, the entire module graph fails before React mounts and the user sees
// a silent blank page. Every network call made with these values fails,
// which the app already handles: guest mode falls back to a local mock user
// (see services/authService.ts).
const LOCAL_DEV_PLACEHOLDER_URL = 'https://placeholder.supabase.co';
const LOCAL_DEV_PLACEHOLDER_KEY = 'placeholder-anon-key';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || LOCAL_DEV_PLACEHOLDER_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || LOCAL_DEV_PLACEHOLDER_KEY;

if (!import.meta.env.VITE_SUPABASE_URL) {
  console.warn("Supabase configuration environment variables are missing. Using local dev placeholder values — cloud auth/sync will be unavailable, but guest mode works fully offline. Configure VITE_SUPABASE_* environment variables to enable persistent authentication and syncing.");
}

// Initialization must never take down the whole app. If Supabase cannot
// initialize, we export undefined; consumers (authService, persistenceService)
// guard against this and degrade to local guest mode.
let clientInstance: SupabaseClient | undefined;

try {
  clientInstance = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  });
} catch (error) {
  console.error("Supabase initialization failed — cloud auth/sync disabled. Guest mode remains available.", error);
}

export const supabase = clientInstance as SupabaseClient;
