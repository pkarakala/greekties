import { useSyncExternalStore } from 'react';
import { uuid } from 'expo-modules-core';
import type { ConversationKind, SendIdentity, SendResult, TextMessage } from './message-send';
import { matchesSend, sendTextMessage } from './message-send';

export const SEND_TIMEOUT_MS = 15000;
export interface SendAttempt extends SendIdentity {
  status: 'pending' | 'failed' | 'uncertain';
  uncertain: boolean;
}
interface RecoveryState {
  draft: string;
  attempt: SendAttempt | null;
  /** Acknowledgments awaiting adoption by a mounted thread, not a history cache. */
  confirmed: TextMessage[];
  error: string | null;
}
export interface RecoveryEntry {
  kind: ConversationKind;
  conversationId: string;
  userId: string;
  state: RecoveryState;
  deleted: Set<string>;
  run: number;
  revoked: boolean;
}
const EMPTY: RecoveryState = { draft: '', attempt: null, confirmed: [], error: null };
const entries = new Map<string, RecoveryEntry>();
const listeners = new Set<() => void>();
let account: string | null = null;
let chapter: string | null = null;
let allowed = false;
let revision = 0;
function emit() {
  revision++;
  listeners.forEach((listener) => listener());
}
function clear() {
  entries.forEach((entry) => {
    entry.state = EMPTY;
    entry.deleted.clear();
    entry.run++;
  });
  entries.clear();
}
function key(kind: ConversationKind, id: string) {
  return `${kind}:${id}`;
}

/** AuthProvider owns this lifecycle. Same-account loading/errors do not call
 * membership confirmation, so temporary revalidation preserves recovery. */
export function setMessageRecoveryAccount(userId: string | null) {
  if (account === userId) return;
  clear();
  account = userId;
  chapter = null;
  allowed = false;
  emit();
}
export function confirmMessageRecoveryMembership(userId: string, chapterId: string | null) {
  if (account !== userId) return;
  if (chapter !== chapterId || allowed !== !!chapterId) {
    clear();
    chapter = chapterId;
    allowed = !!chapterId;
    emit();
  }
}
export function recoveryIsCurrent(entry: RecoveryEntry | null): entry is RecoveryEntry {
  return (
    !!entry &&
    !entry.revoked &&
    allowed &&
    account === entry.userId &&
    entries.get(key(entry.kind, entry.conversationId)) === entry
  );
}
export function getMessageRecovery(
  kind: ConversationKind,
  id: string | null,
  userId: string | null,
) {
  if (!id || !userId || account !== userId || !allowed) return null;
  const entryKey = key(kind, id);
  let entry = entries.get(entryKey);
  if (!entry) {
    entry = {
      kind,
      conversationId: id,
      userId,
      state: EMPTY,
      deleted: new Set(),
      run: 0,
      revoked: false,
    };
    entries.set(entryKey, entry);
  }
  return entry;
}
export function discardConversationRecovery(entry: RecoveryEntry) {
  if (!recoveryIsCurrent(entry)) return;
  entry.run++;
  entry.state = EMPTY;
  entry.revoked = true;
  emit();
}
export function clearConversationDraft(entry: RecoveryEntry) {
  if (!recoveryIsCurrent(entry)) return;
  entry.run++;
  update(entry, EMPTY);
}
export function consumeConfirmedMessages(entry: RecoveryEntry, ids: Set<string>) {
  update(entry, { ...entry.state, confirmed: entry.state.confirmed.filter((m) => !ids.has(m.id)) });
}
export function retryConversationAccess(entry: RecoveryEntry | null) {
  if (
    !entry?.revoked ||
    account !== entry.userId ||
    !allowed ||
    entries.get(key(entry.kind, entry.conversationId)) !== entry
  )
    return;
  entries.delete(key(entry.kind, entry.conversationId));
  emit();
}
export function discardSavedAttempt(
  entry: RecoveryEntry | null,
  expectedId = entry?.state.attempt?.id,
) {
  if (
    !recoveryIsCurrent(entry) ||
    entry.state.attempt?.id !== expectedId ||
    entry.state.attempt?.status === 'pending'
  )
    return;
  entry.run++;
  update(entry, { ...entry.state, attempt: null, error: null });
}
function update(entry: RecoveryEntry, state: RecoveryState) {
  if (!recoveryIsCurrent(entry)) return;
  entry.state = state;
  emit();
}
export function editMessageDraft(entry: RecoveryEntry | null, draft: string) {
  if (recoveryIsCurrent(entry)) update(entry, { ...entry.state, draft, error: null });
}
export function confirmRecoveredMessage(entry: RecoveryEntry, message: TextMessage) {
  if (!recoveryIsCurrent(entry) || entry.deleted.has(message.id)) return;
  const attempt = entry.state.attempt;
  if (!attempt || !matchesSend(message, attempt)) return;
  entry.run++;
  update(entry, {
    ...entry.state,
    attempt: null,
    error: null,
    confirmed: mergeMessages(entry.state.confirmed, [message]),
  });
}
export function forgetDeletedMessage(entry: RecoveryEntry, id: string) {
  if (!recoveryIsCurrent(entry)) return;
  entry.deleted.add(id);
  // An observed deletion is terminal. Never retry/reinsert a moderated message.
  if (entry.state.attempt?.id === id) entry.run++;
  update(entry, {
    ...entry.state,
    attempt: entry.state.attempt?.id === id ? null : entry.state.attempt,
    confirmed: entry.state.confirmed.filter((m) => m.id !== id),
  });
}
export function mergeMessages<T extends TextMessage>(
  old: T[],
  incoming: T[],
  deleted: ReadonlySet<string> = new Set(),
): T[] {
  const rows = new Map(old.map((m) => [m.id, m]));
  incoming.forEach((m) => rows.set(m.id, m));
  return [...rows.values()]
    .filter((m) => !deleted.has(m.id))
    .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
}

/** One unresolved logical send per conversation, not an offline queue. Draft
 * text moves atomically into the visible attempt before any await. New typing
 * lives separately and is never touched by settlement. Nothing auto-sends. */
export async function submitRecoveredMessage(
  entry: RecoveryEntry | null,
  retry = false,
  transport: typeof sendTextMessage = sendTextMessage,
  makeId: () => string = uuid.v4,
) {
  if (!recoveryIsCurrent(entry) || entry.state.attempt?.status === 'pending') return;
  let attempt = entry.state.attempt;
  if (retry ? !attempt : !!attempt || !entry.state.draft.trim()) return;
  if (!attempt) {
    try {
      attempt = {
        id: makeId(),
        kind: entry.kind,
        conversationId: entry.conversationId,
        userId: entry.userId,
        content: entry.state.draft.trim(),
        status: 'pending',
        uncertain: false,
      };
    } catch {
      update(entry, {
        ...entry.state,
        error: 'Couldn’t prepare this message. Your draft is still here. Try again.',
      });
      return;
    }
  }
  const submitted = attempt;
  const run = ++entry.run;
  update(entry, {
    ...entry.state,
    draft: retry ? entry.state.draft : '',
    attempt: { ...submitted, status: 'pending' },
    error: null,
  });
  const current = () => recoveryIsCurrent(entry) && entry.run === run;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<SendResult>((resolve) => {
      timer = setTimeout(() => resolve({ status: 'uncertain' }), SEND_TIMEOUT_MS);
    });
    const result = await Promise.race([
      Promise.resolve().then(() =>
        current() ? transport(submitted, current) : { status: 'inaccessible' as const },
      ),
      timeout,
    ]);
    if (!current()) return;
    if (result.status === 'inaccessible') {
      discardConversationRecovery(entry);
      return;
    }
    if (result.status === 'confirmed' && matchesSend(result.message, submitted)) {
      confirmRecoveredMessage(entry, result.message);
      return;
    }
    const uncertain =
      submitted.uncertain || result.status === 'uncertain' || result.status === 'confirmed';
    update(entry, {
      ...entry.state,
      attempt: { ...submitted, status: uncertain ? 'uncertain' : 'failed', uncertain },
    });
  } catch {
    if (current())
      update(entry, {
        ...entry.state,
        attempt: { ...submitted, status: 'uncertain', uncertain: true },
      });
  } finally {
    if (timer) clearTimeout(timer);
    // A timed-out transport must not dispatch another query or settle a retry.
    if (current()) entry.run++;
  }
}
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export function useMessageRecovery(
  kind: ConversationKind,
  id: string | null,
  userId: string | null,
) {
  useSyncExternalStore(
    subscribe,
    () => revision,
    () => revision,
  );
  const entry = getMessageRecovery(kind, id, userId);
  const attemptId = entry?.state.attempt?.id;
  return {
    entry,
    ...(entry?.state ?? EMPTY),
    setDraft: (draft: string) => editMessageDraft(entry, draft),
    send: () => submitRecoveredMessage(entry),
    retry: () => submitRecoveredMessage(entry, true),
    discard: () => discardSavedAttempt(entry, attemptId),
  };
}
