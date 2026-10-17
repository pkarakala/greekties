import 'react-native-url-polyfill/auto';
import { Platform } from 'react-native';
import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { isOwnerQaBuild } from './qa-build';
import { ownerQaTargetError, createOwnerQaFetch } from '../config/owner-qa-policy.cjs';
import ownerQaRelease from '../config/owner-qa-release.json';

// Adapter so Supabase stores the auth session in the device's secure storage.
const ExpoSecureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

// expo-secure-store has no web implementation, so the web build persists the
// session in localStorage instead. The typeof guard keeps static export/SSR
// (where localStorage doesn't exist) from crashing at module load.
const WebLocalStorageAdapter = {
  getItem: (key: string) =>
    typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null,
  setItem: (key: string, value: string) => {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
  },
  removeItem: (key: string) => {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(key);
  },
};

const storageAdapter = Platform.OS === 'web' ? WebLocalStorageAdapter : ExpoSecureStoreAdapter;

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const qaConfigError = isOwnerQaBuild
  ? ownerQaTargetError(supabaseUrl, ownerQaRelease.supabaseProjectRef)
  : null;

/**
 * Set when required env vars are missing so the app can show a readable
 * config screen instead of crashing at module load (see app/_layout.tsx).
 */
export const supabaseConfigError: string | null =
  qaConfigError ??
  (!supabaseUrl && !supabaseAnonKey
    ? 'EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY are missing.'
    : !supabaseUrl
      ? 'EXPO_PUBLIC_SUPABASE_URL is missing.'
      : !supabaseAnonKey
        ? 'EXPO_PUBLIC_SUPABASE_ANON_KEY is missing.'
        : null);

// Placeholders keep createClient from throwing when .env is unfilled; the
// config-error screen prevents any real request from being made in that case.
export const supabase = createClient(
  qaConfigError
    ? 'https://placeholder.supabase.co'
    : (supabaseUrl ?? 'https://placeholder.supabase.co'),
  qaConfigError ? 'public-anon-key-missing' : (supabaseAnonKey ?? 'public-anon-key-missing'),
  {
    ...(isOwnerQaBuild
      ? {
          global: {
            fetch: createOwnerQaFetch(supabaseUrl, ownerQaRelease.supabaseProjectRef, fetch),
          },
        }
      : {}),
    auth: {
      storage: storageAdapter,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false, // not used in native
    },
  },
);
