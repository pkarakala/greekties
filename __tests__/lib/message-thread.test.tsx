import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { uuid } from 'expo-modules-core';
import { supabase } from '../../lib/supabase';
import { useMessageThread } from '../../lib/message-thread';
import {
  setMessageRecoveryAccount,
  confirmMessageRecoveryMembership,
} from '../../lib/message-recovery';
import { createMessageDb, deferred } from '../helpers/message-db';

jest.mock('../../lib/supabase', () => ({
  supabase: { from: jest.fn(), channel: jest.fn(), removeChannel: jest.fn() },
}));
const unblocked = new Set<string>();
for (const kind of ['channel', 'mentorship'] as const)
  describe(`${kind} thread synchronization`, () => {
    let db: ReturnType<typeof createMessageDb>;
    const table = kind === 'channel' ? 'channel_messages' : 'messages';
    const column = kind === 'channel' ? 'channel_id' : 'request_id';
    const row = (id: string, conversation = 'room') => ({
      id,
      [column]: conversation,
      sender_id: 'me',
      content: id,
      created_at: `2026-09-17T12:00:${id === 'old' ? '00' : '01'}.000Z`,
    });
    beforeEach(() => {
      setMessageRecoveryAccount(null);
      setMessageRecoveryAccount('me');
      confirmMessageRecoveryMembership('me', 'chapter');
      db = createMessageDb();
      (supabase.from as any).mockImplementation(db.from);
      (supabase.channel as any).mockImplementation(db.channel);
      jest.spyOn(uuid, 'v4').mockReturnValue('send-1');
    });
    afterEach(() => {
      jest.restoreAllMocks();
    });
    const mount = () =>
      renderHook(
        ({ id, user, blocked }: { id: string; user: string; blocked: ReadonlySet<string> }) =>
          useMessageThread(kind, id, user, blocked),
        { initialProps: { id: 'room', user: 'me', blocked: unblocked } },
      );

    it('merges realtime-before-response, duplicate events, and response-before-realtime by ID', async () => {
      const screen = mount();
      await waitFor(() => expect(screen.result.current.loading).toBe(false));
      const pending = deferred();
      db.intercept((q) => {
        if (q.op === 'insert') {
          const inserted = db.base(q);
          return pending.promise.then(() => inserted);
        }
      });
      let promise!: Promise<void>;
      act(() => {
        screen.result.current.composer.setDraft('Hello');
      });
      act(() => {
        promise = screen.result.current.composer.send();
      });
      await waitFor(() => expect(db.rows.size).toBe(1));
      const sent = [...db.rows.values()][0];
      await act(async () => {
        db.emit(table, 'INSERT', sent);
        db.emit(table, 'INSERT', sent);
      });
      await waitFor(() => expect(screen.result.current.messages).toHaveLength(1));
      expect(screen.result.current.composer.attempt).toBeNull();
      await act(async () => {
        pending.resolve(null);
        await promise;
      });
      expect(screen.result.current.messages).toHaveLength(1);
      db.intercept(null);
      jest.spyOn(uuid, 'v4').mockReturnValue('send-2');
      act(() => {
        screen.result.current.composer.setDraft('Hello');
      });
      await act(async () => {
        await screen.result.current.composer.send();
      });
      const second = [...db.rows.values()].find((m) => m.id === 'send-2');
      await act(async () => {
        db.emit(table, 'INSERT', second);
        db.emit(table, 'INSERT', second);
      });
      expect(screen.result.current.messages.map((m) => m.id)).toEqual(['send-1', 'send-2']);
    });
    it('does not erase a confirmed send when a delayed initial snapshot arrives', async () => {
      const initial = deferred();
      db.intercept((q) => (q.table === table && !q.single ? initial.promise : undefined));
      const screen = mount();
      await waitFor(() => expect(screen.result.current.parent).not.toBeNull());
      act(() => {
        screen.result.current.composer.setDraft('During load');
      });
      await act(async () => {
        await screen.result.current.composer.send();
      });
      expect(screen.result.current.messages.map((m) => m.id)).toEqual(['send-1']);
      await act(async () => {
        initial.resolve({ data: [row('old')], error: null });
      });
      expect(new Set(screen.result.current.messages.map((m) => m.id))).toEqual(
        new Set(['old', 'send-1']),
      );
    });
    it('keeps a realtime arrival when a delayed initial snapshot arrives', async () => {
      const initial = deferred();
      db.intercept((q) => (q.table === table && !q.single ? initial.promise : undefined));
      const screen = mount();
      await waitFor(() => expect(screen.result.current.parent).not.toBeNull());
      db.seed(table, row('live'));
      await act(async () => {
        db.emit(table, 'INSERT', row('live'));
      });
      await act(async () => {
        initial.resolve({ data: [row('old')], error: null });
      });
      expect(screen.result.current.messages.map((m) => m.id)).toEqual(['old', 'live']);
    });
    it('does not restore a deleted message from delayed fetches or INSERT events', async () => {
      const initial = deferred();
      db.intercept((q) => (q.table === table && !q.single ? initial.promise : undefined));
      const screen = mount();
      await waitFor(() => expect(screen.result.current.parent).not.toBeNull());
      db.seed(table, row('old'));
      await act(async () => {
        db.emit(table, 'DELETE', row('old'));
        db.emit(table, 'INSERT', row('old'));
      });
      await act(async () => {
        initial.resolve({ data: [row('old')], error: null });
      });
      expect(screen.result.current.messages).toHaveLength(0);
    });
    it('retains pending identity and newer draft across navigation without automatically resending', async () => {
      const first = mount();
      await waitFor(() => expect(first.result.current.loading).toBe(false));
      const pending = deferred();
      db.intercept((q) => (q.op === 'insert' ? pending.promise : undefined));
      act(() => {
        first.result.current.composer.setDraft('Submitted');
      });
      let send!: Promise<void>;
      act(() => {
        send = first.result.current.composer.send();
        first.result.current.composer.setDraft('New draft');
      });
      await waitFor(() => expect(db.calls.some((q) => q.op === 'insert')).toBe(true));
      first.unmount();
      const second = mount();
      await waitFor(() => expect(second.result.current.loading).toBe(false));
      expect(second.result.current.composer.draft).toBe('New draft');
      expect(second.result.current.composer.attempt?.id).toBe('send-1');
      expect(db.calls.filter((q) => q.op === 'insert')).toHaveLength(1);
      await act(async () => {
        pending.reject(new Error('offline'));
        await send;
      });
      expect(second.result.current.composer.attempt?.status).toBe('uncertain');
      expect(second.result.current.composer.draft).toBe('New draft');
    });
    it('isolates route changes and ignores old fetches/events, including A → B → A', async () => {
      const old = deferred();
      db.intercept((q) =>
        q.table === table && !q.single && q.filters[column] === 'room' ? old.promise : undefined,
      );
      const screen = mount();
      await waitFor(() => expect(screen.result.current.parent).not.toBeNull());
      act(() => {
        screen.result.current.composer.setDraft('Room A draft');
      });
      screen.rerender({ id: 'other', user: 'me', blocked: unblocked });
      await waitFor(() => expect(screen.result.current.loading).toBe(false));
      expect(screen.result.current.composer.draft).toBe('');
      await act(async () => {
        old.resolve({ data: [row('old')], error: null });
      });
      expect(screen.result.current.messages).toHaveLength(0);
      db.intercept(null);
      screen.rerender({ id: 'room', user: 'me', blocked: unblocked });
      await waitFor(() => expect(screen.result.current.loading).toBe(false));
      expect(screen.result.current.composer.draft).toBe('Room A draft');
      expect(screen.result.current.messages).toHaveLength(0);
    });
    it('hides cleared private state immediately and rejects stale callbacks after membership loss', async () => {
      const screen = mount();
      await waitFor(() => expect(screen.result.current.loading).toBe(false));
      act(() => {
        screen.result.current.composer.setDraft('Private');
      });
      await act(async () => {
        confirmMessageRecoveryMembership('me', null);
        db.emit(table, 'INSERT', row('stale'));
      });
      expect(screen.result.current.parent).toBeNull();
      expect(screen.result.current.messages).toHaveLength(0);
      expect(screen.result.current.composer.draft).toBe('');
    });
    it('drops revoked conversation state on an authorized reload; permits a later fresh access check', async () => {
      const screen = mount();
      await waitFor(() => expect(screen.result.current.loading).toBe(false));
      act(() => {
        screen.result.current.composer.setDraft('Private');
      });
      db.setAccess(false);
      await act(async () => {
        screen.result.current.reload();
      });
      await waitFor(() => expect(screen.result.current.parent).toBeNull());
      expect(screen.result.current.composer.draft).toBe('');
      db.setAccess(true);
      await act(async () => {
        screen.result.current.reload();
      });
      await waitFor(() => expect(screen.result.current.parent).not.toBeNull());
      expect(screen.result.current.composer.draft).toBe('');
    });
    it('recovers from thrown history loads without stuck spinners or erasing already loaded messages', async () => {
      db.intercept((q) => q.table === table && !q.single ? Promise.reject(new Error('offline')) : undefined);
      const screen = mount();
      await waitFor(() => expect(screen.result.current.loading).toBe(false));
      expect(screen.result.current.error).toContain('Couldn’t load');
      db.intercept(null);
      db.seed(table, row('old'));
      await act(async () => { screen.result.current.reload(); });
      await waitFor(() => expect(screen.result.current.messages).toHaveLength(1));
      db.intercept((q) => q.table === table && !q.single ? Promise.reject(new Error('offline')) : undefined);
      await act(async () => { screen.result.current.reload(); });
      await waitFor(() => expect(screen.result.current.error).toContain('Couldn’t load'));
      expect(screen.result.current.messages).toHaveLength(1);
      expect(screen.result.current.loading).toBe(false);
    });
    if (kind === 'mentorship') it('clears an in-flight attempt after acceptance is revoked and ignores its late acknowledgment', async () => {
      const screen = mount();
      await waitFor(() => expect(screen.result.current.loading).toBe(false));
      const pending = deferred();
      db.intercept((q) => q.op === 'insert' ? pending.promise : undefined);
      act(() => { screen.result.current.composer.setDraft('Submitted'); });
      let send!: Promise<void>;
      act(() => { send = screen.result.current.composer.send(); screen.result.current.composer.setDraft('Private draft'); });
      await waitFor(() => expect(db.calls.some((q) => q.op === 'insert')).toBe(true));
      db.setStatus('declined');
      await act(async () => { db.emit('mentorship_requests', 'UPDATE', { id: 'room' }); });
      expect(screen.result.current.composer.draft).toBe('');
      expect(screen.result.current.composer.attempt).toBeNull();
      await act(async () => { pending.resolve({ data: { ...row('send-1'), content: 'Submitted' }, error: null }); await send; });
      expect(screen.result.current.messages).toHaveLength(0);
    });
    it('keeps load errors separate from send errors and filters blocked realtime content', async () => {
      db.seed(table, row('old'));
      const screen = mount();
      await waitFor(() => expect(screen.result.current.messages).toHaveLength(1));
      db.intercept((q) =>
        q.op === 'insert' ? { data: null, error: { code: '42501' } } : undefined,
      );
      act(() => {
        screen.result.current.composer.setDraft('Denied');
      });
      await act(async () => {
        await screen.result.current.composer.send();
      });
      expect(screen.result.current.error).toBeNull();
      expect(screen.result.current.messages).toHaveLength(1);
      screen.rerender({ id: 'room', user: 'me', blocked: new Set(['peer']) });
      const blocked = { ...row('blocked'), sender_id: 'peer' };
      db.seed(table, blocked);
      await act(async () => {
        db.emit(table, 'INSERT', blocked);
      });
      expect(screen.result.current.messages.every((m) => m.sender_id !== 'peer')).toBe(true);
    });
    if (kind === 'channel')
      it('preserves pagination and merges a delayed history page without duplicates or loss', async () => {
        for (let n = 1; n <= 50; n++)
          db.seed(table, { ...row(`page-${n}`), created_at: new Date(n * 1000).toISOString() });
        const screen = mount();
        await waitFor(() => expect(screen.result.current.hasMore).toBe(true));
        const page = deferred();
        db.intercept((q) => (q.before ? page.promise : undefined));
        let paging!: Promise<void>;
        act(() => {
          paging = screen.result.current.loadEarlier();
        });
        act(() => {
          screen.result.current.composer.setDraft('New send');
        });
        await act(async () => {
          await screen.result.current.composer.send();
        });
        await act(async () => {
          page.resolve({
            data: [{ ...row('old'), created_at: new Date(0).toISOString() }, row('send-1')],
            error: null,
          });
          await paging;
        });
        expect(screen.result.current.messages).toHaveLength(52);
        expect(screen.result.current.messages.filter((m) => m.id === 'send-1')).toHaveLength(1);
        expect(screen.result.current.loadingEarlier).toBe(false);
      });
  });
