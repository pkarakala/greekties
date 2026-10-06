import { uuid } from 'expo-modules-core';
import { supabase } from './supabase';
import {
  editMessageDraft,
  getMessageRecovery,
  recoveryIsCurrent,
  type RecoveryEntry,
} from './message-recovery';

export type ShareKind = 'events' | 'jobs';
export interface ShareResource {
  kind: ShareKind;
  id: string;
}
const ID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const DETAIL = new RegExp(`^/(events|jobs)/(${ID})$`, 'i');
export function parseDetailLink(text: string): ShareResource | null {
  const match = DETAIL.exec(text);
  // Route names are case-sensitive; UUID hex is not.
  return match && (match[1] === 'events' || match[1] === 'jobs')
    ? { kind: match[1], id: match[2] }
    : null;
}
export function detailLink(resource: ShareResource): string {
  const path = `/${resource.kind}/${resource.id}`;
  if (!parseDetailLink(path)) throw new Error('Unsupported detail link');
  return path;
}
export interface ShareChannel {
  id: string;
  name: string;
  chapter_id: string;
}
async function visibleChannel(id: string) {
  const result = await supabase.rpc('is_channel_visible', { p_channel_id: id });
  if (result.error) throw new Error('Channel access unavailable');
  return result.data === true;
}
export async function listShareChannels(
  chapterId: string,
  offset = 0,
): Promise<{ channels: ShareChannel[]; hasMore: boolean }> {
  const result = await supabase
    .from('channels')
    .select('id, name, chapter_id')
    .eq('chapter_id', chapterId)
    .order('name')
    .order('id')
    .range(offset, offset + 49);
  if (result.error || !result.data) throw new Error('Channels unavailable');
  // Admin SELECT permission also exposes channels they cannot send to. Check
  // the existing send-visibility predicate before displaying each destination.
  const flags = await Promise.all(result.data.map((c) => visibleChannel(c.id)));
  return {
    channels: result.data.filter((_, index) => flags[index]),
    hasMore: result.data.length === 50,
  };
}
export async function validateShare(
  resource: ShareResource,
  channelId: string,
  chapterId: string,
  current: () => boolean,
) {
  detailLink(resource);
  if (!current()) throw new Error('Share expired');
  const source = await supabase
    .from(resource.kind === 'events' ? 'events' : 'job_postings')
    .select('id, chapter_id, title')
    .eq('id', resource.id)
    .eq('chapter_id', chapterId)
    .maybeSingle();
  if (!current() || source.error || !source.data)
    throw new Error('This item is removed or unavailable.');
  const channel = await supabase
    .from('channels')
    .select('id, name, chapter_id')
    .eq('id', channelId)
    .eq('chapter_id', chapterId)
    .maybeSingle();
  if (!current() || channel.error || !channel.data) throw new Error('This channel is unavailable.');
  const allowed = await visibleChannel(channelId);
  if (!current() || !allowed) throw new Error('This channel is unavailable.');
  const title = String(source.data.title).replace(/\s+/g, ' ').trim().slice(0, 160);
  return `${title}\n${detailLink(resource)}`;
}
export interface ChatShare {
  id: string;
  entry: RecoveryEntry;
  resource: ShareResource;
  chapterId: string;
  text: string;
  state: 'ready' | 'checking' | 'consumed' | 'cancelled';
}
const shares = new WeakMap<RecoveryEntry, Map<string, ChatShare>>();
export async function prepareChatShare(
  resource: ShareResource,
  channelId: string,
  chapterId: string,
  userId: string,
  current: () => boolean,
) {
  const entry = getMessageRecovery('channel', channelId, userId);
  const valid = () => current() && recoveryIsCurrent(entry);
  if (!valid() || !entry)
    throw new Error('Channel recovery is unavailable. Reopen chat and try again.');
  const text = await validateShare(resource, channelId, chapterId, valid);
  if (!valid()) throw new Error('Share expired');
  const share: ChatShare = { id: uuid.v4(), entry, resource, chapterId, text, state: 'ready' };
  const saved = shares.get(entry) ?? new Map();
  saved.set(share.id, share);
  shares.set(entry, saved);
  return share;
}
export function getChatShare(entry: RecoveryEntry | null, id: string | undefined) {
  if (!recoveryIsCurrent(entry) || !id) return null;
  const share = shares.get(entry)?.get(id);
  return share && share.state !== 'consumed' && share.state !== 'cancelled' ? share : null;
}
// Validation ownership lets a blurred review relinquish only its own read.
// A late completion cannot reset the state of a newer validation of this share.
const validationRuns = new WeakMap<ChatShare, () => boolean>();
export function pauseChatShareValidation(share: ChatShare, owner: () => boolean) {
  if (validationRuns.get(share) !== owner) return;
  validationRuns.delete(share);
  if (share.state === 'checking') share.state = 'ready';
}
export function cancelChatShare(share: ChatShare) {
  if (share.state !== 'consumed') share.state = 'cancelled';
}
/** Append to the latest draft only. An existing send attempt is never changed.
 * Consumption happens before the store emits, so repeat navigation is inert. */
export async function appendChatShare(share: ChatShare, current: () => boolean): Promise<boolean> {
  if (share.state !== 'ready' || !current() || !recoveryIsCurrent(share.entry)) return false;
  share.state = 'checking';
  validationRuns.set(share, current);
  const valid = () =>
    validationRuns.get(share) === current &&
    share.state === 'checking' &&
    current() &&
    recoveryIsCurrent(share.entry);
  try {
    const text = await validateShare(
      share.resource,
      share.entry.conversationId,
      share.chapterId,
      valid,
    );
    if (!valid()) return false;
    const draft = share.entry.state.draft;
    share.state = 'consumed';
    editMessageDraft(share.entry, draft ? `${draft}\n\n${text}` : text);
    return true;
  } finally {
    pauseChatShareValidation(share, current);
  }
}
