import { parseInviteCode } from './links';

export interface PendingInvite {
  code: string;
  revision: string;
}
export interface InviteStorage {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
}
export const PENDING_INVITE_KEY = 'gt.pending_invite_code';
export const INVITE_STORAGE_WARNING =
  'This invitation could not be saved on this device. Keep the original link and reopen it after logging in or restarting.';

function decode(raw: string | null): PendingInvite | null {
  if (!raw) return null;
  // Read older native installs' raw codes without consuming them.
  const legacy = parseInviteCode(raw);
  if (legacy) return { code: legacy, revision: `legacy:${legacy}` };
  try {
    const value = JSON.parse(raw);
    if (
      value?.version !== 1 ||
      typeof value.revision !== 'string' ||
      !value.revision ||
      value.revision.length > 200 ||
      typeof value.code !== 'string' ||
      parseInviteCode(value.code) !== value.code
    )
      return null;
    return { code: value.code, revision: value.revision };
  } catch {
    return null;
  }
}

/** Serializes read/compare/write on native. A revision prevents A→B→A races.
 * Memory fallback keeps retries usable if persistence is unavailable.
 */
export function createPendingInviteStore(storage: InviteStorage) {
  let memory: PendingInvite | null = null;
  let memoryOnly = false;
  let sequence = 0;
  let queue = Promise.resolve();
  function serial<T>(action: () => Promise<T>): Promise<T> {
    const next = queue.then(action);
    queue = next.then(
      () => {},
      () => {},
    );
    return next;
  }
  async function read() {
    if (!memoryOnly) {
      try {
        memory = decode(await storage.getItem(PENDING_INVITE_KEY));
      } catch {
        memoryOnly = true;
      }
    }
    return { invite: memory, warning: memoryOnly ? INVITE_STORAGE_WARNING : null };
  }
  return {
    read: () => serial(read),
    save: (input: string) =>
      serial(async () => {
        const code = parseInviteCode(input);
        if (!code) throw new Error('Enter a valid invitation code or Greek Ties link.');
        await read();
        if (memory?.code !== code) {
          memory = {
            code,
            revision: `${Date.now()}-${++sequence}-${Math.random().toString(36).slice(2)}`,
          };
        }
        try {
          await storage.setItem(PENDING_INVITE_KEY, JSON.stringify({ version: 1, ...memory }));
          memoryOnly = false;
        } catch {
          memoryOnly = true;
        }
        return { invite: memory!, warning: memoryOnly ? INVITE_STORAGE_WARNING : null };
      }),
    clear: (expected: PendingInvite) =>
      serial(async () => {
        await read();
        if (memory?.revision !== expected.revision) return { cleared: false, warning: null };
        memory = null;
        try {
          await storage.removeItem(PENDING_INVITE_KEY);
          memoryOnly = false;
          return { cleared: true, warning: null };
        } catch {
          memoryOnly = true;
          return {
            cleared: true,
            warning:
              'The saved invitation could not be removed from device storage. It may reappear after restarting.',
          };
        }
      }),
  };
}
