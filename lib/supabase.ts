import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';

// Adapter so Supabase stores the auth session in the device's secure storage.
const ExpoSecureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Set when required env vars are missing so the app can show a readable
 * config screen instead of crashing at module load (see app/_layout.tsx).
 */
export const supabaseConfigError: string | null =
  !supabaseUrl && !supabaseAnonKey
    ? 'EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY are missing.'
    : !supabaseUrl
      ? 'EXPO_PUBLIC_SUPABASE_URL is missing.'
      : !supabaseAnonKey
        ? 'EXPO_PUBLIC_SUPABASE_ANON_KEY is missing.'
        : null;

// Placeholders keep createClient from throwing when .env is unfilled; the
// config-error screen prevents any real request from being made in that case.
export const supabase = createClient(
  supabaseUrl ?? 'https://placeholder.supabase.co',
  supabaseAnonKey ?? 'public-anon-key-missing',
  {
    auth: {
      storage: ExpoSecureStoreAdapter,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false, // not used in native
    },
  },
);
