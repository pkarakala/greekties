import { describe, expect, it, jest } from '@jest/globals';
import {
  createPendingInviteStore,
  PENDING_INVITE_KEY,
  type InviteStorage,
} from '../../lib/pending-invite';

function storage() {
  const values = new Map<string, string>();
  const adapter: InviteStorage = {
    getItem: jest.fn(async (key: string) => values.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => {
      values.set(key, value);
    }),
    removeItem: jest.fn(async (key: string) => {
      values.delete(key);
    }),
  };
  return { values, adapter };
}

describe('recoverable pending invitation', () => {
  it('survives repeated reads, retries, email confirmation, and a process restart', async () => {
    const { adapter } = storage();
    const first = createPendingInviteStore(adapter);
    const saved = await first.save(' ABC123 ');
    expect(saved.warning).toBeNull();
    expect((await first.read()).invite).toEqual(saved.invite);
    expect((await first.read()).invite).toEqual(saved.invite);
    const restarted = createPendingInviteStore(adapter);
    expect((await restarted.read()).invite).toEqual(saved.invite);
    expect(adapter.removeItem).not.toHaveBeenCalled();
    await restarted.clear(saved.invite);
    expect((await createPendingInviteStore(adapter).read()).invite).toBeNull();
  });
  it('retains the revision through login/signup for the same code', async () => {
    const store = createPendingInviteStore(storage().adapter);
    expect((await store.save('a')).invite).toEqual((await store.save('A')).invite);
  });
  it('never lets an old successful join clear a replacement, even A → B → A', async () => {
    const store = createPendingInviteStore(storage().adapter);
    const a = await store.save('a');
    await store.save('b');
    const replacement = await store.save('a');
    expect(await store.clear(a.invite)).toEqual({ cleared: false, warning: null });
    expect((await store.read()).invite).toEqual(replacement.invite);
  });
  it('serializes overlapping native writes and stale cleanup', async () => {
    const store = createPendingInviteStore(storage().adapter);
    const old = await store.save('a');
    await Promise.all([store.save('b'), store.clear(old.invite)]);
    expect((await store.read()).invite?.code).toBe('b');
  });
  it('preserves a replacement written by another browser tab before cleanup', async () => {
    const { adapter } = storage();
    const one = createPendingInviteStore(adapter),
      two = createPendingInviteStore(adapter);
    const old = await one.save('a');
    await two.save('b');
    await one.clear(old.invite);
    expect((await two.read()).invite?.code).toBe('b');
  });
  it('keeps in-memory retries available and warns when storage fails', async () => {
    const { adapter } = storage();
    jest.mocked(adapter.getItem).mockRejectedValue(new Error('unavailable'));
    jest.mocked(adapter.setItem).mockRejectedValue(new Error('unavailable'));
    const store = createPendingInviteStore(adapter);
    const saved = await store.save('abc');
    expect(saved.warning).toMatch(/original link/);
    expect((await store.read()).invite).toEqual(saved.invite);
  });
  it('reports failed cancellation persistence without resurrecting it in this session', async () => {
    const { adapter } = storage();
    const store = createPendingInviteStore(adapter);
    const saved = await store.save('a');
    jest.mocked(adapter.removeItem).mockRejectedValue(new Error('unavailable'));
    expect((await store.clear(saved.invite)).warning).toMatch(/reappear/);
    expect((await store.read()).invite).toBeNull();
  });
  it.each([
    '{"version":2,"code":"a","revision":"r"}',
    '{broken',
    '{"version":1,"code":"../bad","revision":"r"}',
    '[]',
    '{"version":1,"code":null,"revision":"r"}',
  ])('ignores malformed stored data: %s', async (raw) => {
    const { adapter, values } = storage();
    values.set(PENDING_INVITE_KEY, raw);
    expect((await createPendingInviteStore(adapter).read()).invite).toBeNull();
  });
  it('reads legacy native raw codes without deleting them', async () => {
    const { adapter, values } = storage();
    values.set(PENDING_INVITE_KEY, 'ABC123');
    expect((await createPendingInviteStore(adapter).read()).invite?.code).toBe('abc123');
    expect(adapter.removeItem).not.toHaveBeenCalled();
  });
  it('does not replace valid context with malformed input', async () => {
    const store = createPendingInviteStore(storage().adapter);
    const original = await store.save('a');
    await expect(store.save('bad/code')).rejects.toThrow();
    expect((await store.read()).invite).toEqual(original.invite);
  });
});
