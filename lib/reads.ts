import * as SecureStore from 'expo-secure-store';
import { supabase } from './supabase';

// Per-channel "last read" timestamps for unread indicators. Source of truth is
// `channel_members.last_read_at` (cross-device); the local SecureStore values
// below are kept as a fallback for devices that are offline, pre-migration
// DBs, and private channels the user has no membership row in.
// Channel ids are UUIDs, which are valid SecureStore keys (alphanumeric + hyphen).
const keyFor = (channelId: string) => `lastread_${channelId}`;

export async function getLastRead(channelId: string): Promise<number> {
  try {
    const v = await SecureStore.getItemAsync(keyFor(channelId));
    return v ? Number(v) : 0;
  } catch {
    return 0;
  }
}

export async function markRead(channelId: string, when: number = Date.now()): Promise<void> {
  try {
    await SecureStore.setItemAsync(keyFor(channelId), String(when));
  } catch {
    // Non-fatal: unread dots are a nicety, not correctness-critical.
  }
}

/**
 * Record that the user has read a channel: always writes the local timestamp,
 * then best-effort mirrors it to `channel_members.last_read_at` so other
 * devices agree. Server errors are swallowed — RLS denies the self-insert for
 * private channels the user was never added to, and the table may not exist
 * pre-migration. The local write keeps unread dots working either way.
 */
export async function markChannelRead(channelId: string, userId: string): Promise<void> {
  const when = Date.now();
  await markRead(channelId, when);
  if (!userId) return;

  try {
    const nowIso = new Date(when).toISOString();
    const { data, error } = await supabase
      .from('channel_members')
      .update({ last_read_at: nowIso })
      .eq('channel_id', channelId)
      .eq('user_id', userId)
      .select('id');
    if (error || (data ?? []).length > 0) return;

    // No membership row yet. Self-insert is only allowed for public
    // ('all') channels in the user's chapter per RLS — private channels
    // reject it, which is fine (local fallback covers them).
    const { error: insertErr } = await supabase
      .from('channel_members')
      .insert({ channel_id: channelId, user_id: userId });
    if (insertErr) return;

    await supabase
      .from('channel_members')
      .update({ last_read_at: nowIso })
      .eq('channel_id', channelId)
      .eq('user_id', userId);
  } catch {
    // Offline / pre-migration / RLS denial — local timestamp already saved.
  }
}

/**
 * All server-side last-read timestamps for a user, keyed by channel id
 * (values are epoch millis). Empty map on any error so callers can always
 * merge it with the local fallback.
 */
export async function getServerLastReads(userId: string): Promise<Map<string, number>> {
  const reads = new Map<string, number>();
  if (!userId) return reads;
  try {
    const { data, error } = await supabase
      .from('channel_members')
      .select('channel_id, last_read_at')
      .eq('user_id', userId);
    if (error || !data) return reads;
    for (const row of data as { channel_id: string; last_read_at: string | null }[]) {
      if (row.last_read_at) reads.set(row.channel_id, new Date(row.last_read_at).getTime());
    }
    return reads;
  } catch {
    return reads;
  }
}
