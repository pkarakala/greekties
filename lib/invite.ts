import * as SecureStore from 'expo-secure-store';
import { supabase } from './supabase';

// Invite codes must survive the email-confirmation round trip: the user signs
// up with a code, confirms in Mail, then logs in — the code is restored here.
const KEY = 'gt.pending_invite_code';

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
export async function resolveChapterInvite(code: string): Promise<ChapterInvitePreview | null> {
  const normalized = code.trim().toLowerCase();
  if (!normalized) return null;

  try {
    const { data, error } = await supabase.rpc('resolve_chapter_invite', {
      invite_code: normalized,
    });
    if (error) return null;

    const row = (Array.isArray(data) ? data[0] : data) as InvitePreviewRow | null;
    if (!row?.chapter_id || !row.chapter_name) return null;
    return {
      id: row.chapter_id,
      name: row.chapter_name,
      designation: row.chapter_designation,
      university: row.chapter_university,
    };
  } catch {
    return null;
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

    if (/not valid|revoked|expired|already belong/i.test(error.message)) {
      return { error: error.message };
    }
    return { error: JOIN_NOT_AVAILABLE };
  } catch {
    return { error: JOIN_NOT_AVAILABLE };
  }
}

export async function storePendingInviteCode(code: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(KEY, code);
  } catch {
    // Non-fatal: worst case the user re-opens the invite link.
  }
}

/** Returns the stored code (if any) and clears it. */
export async function consumePendingInviteCode(): Promise<string | null> {
  try {
    const code = await SecureStore.getItemAsync(KEY);
    if (code) await SecureStore.deleteItemAsync(KEY);
    return code;
  } catch {
    return null;
  }
}
