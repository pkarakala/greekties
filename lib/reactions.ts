import { supabase } from './supabase';

// Emoji reactions on channel messages (GroupMe chat parity). Backed by the
// `message_reactions` table from supabase/migrations/app-v4-reactions.sql.
// The table may not exist in the live DB yet, so every call degrades
// gracefully — empty map / friendly message, never a raw Postgres error.

/** True for "relation does not exist" — the reactions migration hasn't run. */
function isMissingTable(message: string): boolean {
  return /does not exist|schema cache/i.test(message);
}

const NOT_SET_UP = 'Reactions aren’t set up yet — run the reactions migration.';

/** The quick-react choices offered by the long-press sheet. */
export const QUICK_EMOJI = ['👍', '❤️', '😂', '🔥', '🎉', '😮'] as const;

/** One aggregated reaction pill: an emoji, how many, and whether I'm one of them. */
export interface ReactionSummary {
  emoji: string;
  count: number;
  /** True when the viewing user is among the reactors (gold pill + tap removes). */
  mine: boolean;
}

/** Map of message id → its aggregated reactions (messages with none are absent). */
export type ReactionsByMessage = Map<string, ReactionSummary[]>;

interface ReactionRow {
  message_id: string;
  user_id: string;
  emoji: string;
}

/**
 * All reactions for a page of messages, aggregated per message into
 * { emoji, count, mine } summaries (first-seen emoji order, which follows
 * created_at — pills keep a stable order as counts change). Returns an empty
 * map on any error (including the table not existing yet) so callers can
 * always render.
 */
export async function fetchReactions(
  messageIds: string[],
  userId: string | null,
): Promise<ReactionsByMessage> {
  const byMessage: ReactionsByMessage = new Map();
  if (messageIds.length === 0) return byMessage;

  try {
    const { data, error } = await supabase
      .from('message_reactions')
      .select('message_id, user_id, emoji')
      .in('message_id', messageIds)
      .order('created_at', { ascending: true });
    if (error || !data) return byMessage;

    for (const row of data as ReactionRow[]) {
      const list = byMessage.get(row.message_id) ?? [];
      let entry = list.find((r) => r.emoji === row.emoji);
      if (!entry) {
        entry = { emoji: row.emoji, count: 0, mine: false };
        list.push(entry);
      }
      entry.count += 1;
      if (userId && row.user_id === userId) entry.mine = true;
      byMessage.set(row.message_id, list);
    }
  } catch {
    // Pre-migration or transient failure — no pills is a fine fallback.
  }
  return byMessage;
}

/**
 * Toggle the caller's reaction: insert the row; if it already exists
 * (duplicate key on the (message_id, user_id, emoji) pk), delete it instead.
 * Returns which way it went so callers can reconcile optimistic state.
 */
export async function toggleReaction(
  messageId: string,
  userId: string,
  emoji: string,
): Promise<{ error: string | null; removed?: boolean }> {
  try {
    const { error } = await supabase
      .from('message_reactions')
      .insert({ message_id: messageId, user_id: userId, emoji });
    if (!error) return { error: null, removed: false };

    // Already reacted with this emoji → toggle off.
    if (/duplicate key/i.test(error.message)) {
      const { error: delErr } = await supabase
        .from('message_reactions')
        .delete()
        .eq('message_id', messageId)
        .eq('user_id', userId)
        .eq('emoji', emoji);
      if (!delErr) return { error: null, removed: true };
      return { error: 'Couldn’t remove your reaction. Please try again.' };
    }

    return {
      error: isMissingTable(error.message)
        ? NOT_SET_UP
        : 'Couldn’t add your reaction. Please try again.',
    };
  } catch {
    return { error: 'Couldn’t add your reaction. Please try again.' };
  }
}
