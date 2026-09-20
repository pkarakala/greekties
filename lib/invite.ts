import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { supabase } from './supabase';
import { createPendingInviteStore } from './pending-invite';
import { parseInviteCode } from './links';

// Invite codes must survive the email-confirmation round trip: the user signs
// up with a code, confirms in Mail, then logs in — the code is restored here.
const pending = createPendingInviteStore({
  async getItem(key) {
    return Platform.OS === 'web' ? localStorage.getItem(key) : SecureStore.getItemAsync(key);
  },
  async setItem(key, value) {
    if (Platform.OS === 'web') localStorage.setItem(key, value);
    else await SecureStore.setItemAsync(key, value);
  },
  async removeItem(key) {
    if (Platform.OS === 'web') localStorage.removeItem(key);
    else await SecureStore.deleteItemAsync(key);
  },
});
export const readPendingInvite = pending.read;
export const storePendingInviteCode = pending.save;
export const clearPendingInvite = pending.clear;

export interface ChapterInvitePreview {
  id: string;
  name: string;
  designation: string | null;
  university: string | null;
}

interface InvitePreviewRow {
  chapter_id: string;
  chapter_name: string;
  chapter_designation: string | null;
  chapter_university: string | null;
}

const JOIN_NOT_AVAILABLE =
  'Secure chapter joining isn’t available right now. Please try again later.';

/** Resolve only the display fields exposed by the server-side invite RPC. */
export type InviteResolution =
  { kind: 'valid'; chapter: ChapterInvitePreview } | { kind: 'invalid' } | { kind: 'error' };

export async function resolveChapterInvite(code: string): Promise<InviteResolution> {
  const normalized = parseInviteCode(code);
  if (!normalized) return { kind: 'invalid' };

  try {
    const { data, error } = await supabase.rpc('resolve_chapter_invite', {
      invite_code: normalized,
    });
    if (error) return { kind: 'error' };

    const row = (Array.isArray(data) ? data[0] : data) as InvitePreviewRow | null;
    if (!row) return { kind: 'invalid' };
    if (!row.chapter_id || !row.chapter_name) return { kind: 'error' };
    return {
      kind: 'valid',
      chapter: {
        id: row.chapter_id,
        name: row.chapter_name,
        designation: row.chapter_designation,
        university: row.chapter_university,
      },
    };
  } catch {
    return { kind: 'error' };
  }
}

/**
 * Join via the SECURITY DEFINER RPC. There is deliberately no table-insert
 * fallback: if the secure server path is unavailable, joining fails closed.
 */
export async function joinChapterWithInvite(code: string): Promise<{ error: string | null }> {
  try {
    const { error } = await supabase.rpc('join_chapter', {
      invite_code: code.trim().toLowerCase(),
    });
    if (!error) return { error: null };

    if (/not valid|revoked|expired|already belong|reinstat|pending/i.test(error.message)) {
      return { error: error.message };
    }
    return { error: JOIN_NOT_AVAILABLE };
  } catch {
    return { error: JOIN_NOT_AVAILABLE };
  }
}
