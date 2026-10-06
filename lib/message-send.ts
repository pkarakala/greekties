import { supabase } from './supabase';
import type { ChannelMessage, Message, Channel, MentorshipRequest } from './types';

export type ConversationKind = 'channel' | 'mentorship';
export type TextMessage = ChannelMessage | Message;
export interface SendIdentity {
  id: string;
  kind: ConversationKind;
  conversationId: string;
  userId: string;
  content: string;
}
export type SendResult =
  | { status: 'confirmed'; message: TextMessage }
  | { status: 'failed' | 'uncertain' | 'inaccessible' };

export const messageTable = (kind: ConversationKind) =>
  kind === 'channel' ? 'channel_messages' : 'messages';
export const conversationColumn = (kind: ConversationKind) =>
  kind === 'channel' ? 'channel_id' : 'request_id';

export function matchesSend(row: TextMessage | null, send: SendIdentity): row is TextMessage {
  return (
    !!row &&
    row.id === send.id &&
    row.sender_id === send.userId &&
    row.content === send.content &&
    typeof row.created_at === 'string' &&
    (send.kind === 'channel' ? (row as ChannelMessage).channel_id : (row as Message).request_id) ===
      send.conversationId
  );
}

/** These are ordinary authenticated reads: RLS remains the authority. */
export async function readConversation(kind: ConversationKind, id: string) {
  return await supabase
    .from(kind === 'channel' ? 'channels' : 'mentorship_requests')
    .select('*')
    .eq('id', id)
    .maybeSingle();
}
export function canSendTo(
  kind: ConversationKind,
  row: Channel | MentorshipRequest | null,
  userId: string,
) {
  if (!row) return false;
  if (kind === 'channel') return true;
  const request = row as MentorshipRequest;
  return (
    request.status === 'accepted' &&
    (request.from_user_id === userId || request.to_user_id === userId)
  );
}
export async function readMessage(kind: ConversationKind, conversationId: string, id: string) {
  return await supabase
    .from(messageTable(kind))
    .select('*')
    .eq(conversationColumn(kind), conversationId)
    .eq('id', id)
    .maybeSingle();
}

/** INSERT only. A conflict is never an acknowledgment. Retries recheck access,
 * then read the exact immutable identity before attempting the same primary key.
 * `current` must be checked after awaits and before dispatching any later query.
 */
export async function sendTextMessage(
  send: SendIdentity,
  current: () => boolean,
): Promise<SendResult> {
  if (!send.content.trim()) return { status: 'failed' };
  try {
    if (!current()) return { status: 'inaccessible' };
    const parent = await readConversation(send.kind, send.conversationId);
    if (!current()) return { status: 'inaccessible' };
    if (parent.error) return { status: 'uncertain' };
    if (!canSendTo(send.kind, parent.data, send.userId)) return { status: 'inaccessible' };

    const prior = await readMessage(send.kind, send.conversationId, send.id);
    if (!current()) return { status: 'inaccessible' };
    if (prior.error) return { status: 'uncertain' };
    if (prior.data)
      return matchesSend(prior.data, send)
        ? { status: 'confirmed', message: prior.data }
        : { status: 'failed' };

    let insertError: { code?: string } | null = null;
    try {
      const result = await supabase
        .from(messageTable(send.kind))
        .insert({
          id: send.id,
          [conversationColumn(send.kind)]: send.conversationId,
          sender_id: send.userId,
          content: send.content,
        })
        .select('*')
        .maybeSingle();
      if (!current()) return { status: 'inaccessible' };
      if (!result.error && matchesSend(result.data, send))
        return { status: 'confirmed', message: result.data };
      insertError = result.error;
    } catch {
      // The server may have committed before the response was lost.
    }
    if (!current()) return { status: 'inaccessible' };
    const check = await readMessage(send.kind, send.conversationId, send.id);
    if (!current()) return { status: 'inaccessible' };
    if (!check.error && matchesSend(check.data, send))
      return { status: 'confirmed', message: check.data };
    // SQL permission/constraint errors are definite failures of this insert,
    // but never proof that an earlier ambiguous attempt failed too.
    if (
      !check.error &&
      (check.data ||
        insertError?.code === '42501' ||
        insertError?.code?.startsWith('22') ||
        insertError?.code?.startsWith('23'))
    )
      return { status: 'failed' };
    return { status: 'uncertain' };
  } catch {
    return { status: 'uncertain' };
  }
}
