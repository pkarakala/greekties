import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { supabase } from '../../lib/supabase';
import { sendTextMessage, type SendIdentity } from '../../lib/message-send';
import { createMessageDb, deferred } from '../helpers/message-db';

jest.mock('../../lib/supabase', () => ({ supabase: { from: jest.fn() } }));

for (const kind of ['channel', 'mentorship'] as const) {
  describe(`${kind} authenticated retry transport`, () => {
    let db: ReturnType<typeof createMessageDb>;
    const table = kind === 'channel' ? 'channel_messages' : 'messages';
    const column = kind === 'channel' ? 'channel_id' : 'request_id';
    const send: SendIdentity = {
      kind,
      id: 'uuid-1',
      conversationId: 'room',
      userId: 'me',
      content: 'Hello',
    };
    beforeEach(() => {
      db = createMessageDb();
      (supabase.from as any).mockImplementation(db.from);
    });
    it('confirms only an exact acknowledgment and rejects empty input without dispatch', async () => {
      expect(await sendTextMessage({ ...send, content: '  ' }, () => true)).toEqual({
        status: 'failed',
      });
      expect(db.calls).toHaveLength(0);
      expect((await sendTextMessage(send, () => true)).status).toBe('confirmed');
      expect(db.rows.size).toBe(1);
      expect(db.calls.find((q) => q.op === 'insert')?.row.id).toBe(send.id);
    });
    it('recovers a committed insert with a lost response using the same identity', async () => {
      let hideRead = false;
      db.intercept((q) => {
        if (q.op === 'insert') {
          db.base(q);
          hideRead = true;
          return Promise.reject(new Error('lost response'));
        }
        if (hideRead && q.table === table) return { data: null, error: { message: 'offline' } };
      });
      expect(await sendTextMessage(send, () => true)).toEqual({ status: 'uncertain' });
      db.intercept(null);
      expect((await sendTextMessage(send, () => true)).status).toBe('confirmed');
      expect(db.rows.size).toBe(1);
      expect(db.calls.filter((q) => q.op === 'insert')).toHaveLength(1);
    });
    it('handles two overlapping attempts with one committed row', async () => {
      const results = await Promise.all([
        sendTextMessage(send, () => true),
        sendTextMessage(send, () => true),
      ]);
      expect(results.map((r) => r.status)).toEqual(['confirmed', 'confirmed']);
      expect(db.rows.size).toBe(1);
    });
    it('permits an intentional second identical message with a new UUID', async () => {
      await sendTextMessage(send, () => true);
      await sendTextMessage({ ...send, id: 'uuid-2' }, () => true);
      expect(db.rows.size).toBe(2);
    });
    it('reports denied inserts separately from transport uncertainty', async () => {
      db.intercept((q) =>
        q.op === 'insert' ? { data: null, error: { code: '42501' } } : undefined,
      );
      expect(await sendTextMessage(send, () => true)).toEqual({ status: 'failed' });
      db.intercept((q) => (q.op === 'insert' ? Promise.reject(new Error('network')) : undefined));
      expect(await sendTextMessage(send, () => true)).toEqual({ status: 'uncertain' });
    });
    it.each([null, {}, []])(
      'does not treat an empty/malformed acknowledgment as confirmation (%p)',
      async (data) => {
        db.intercept((q) => (q.op === 'insert' ? { data, error: null } : undefined));
        expect(await sendTextMessage(send, () => true)).toEqual({ status: 'uncertain' });
      },
    );
    it('reconciles an empty acknowledgment when a subsequent authorized read confirms the row', async () => {
      db.intercept((q) => {
        if (q.op === 'insert') {
          db.base(q);
          return { data: null, error: null };
        }
      });
      expect((await sendTextMessage(send, () => true)).status).toBe('confirmed');
    });
    it.each(['content', 'sender_id', column])(
      'never interprets an identity conflict with different %s as delivery',
      async (field) => {
        db.seed(table, {
          id: send.id,
          [column]: send.conversationId,
          sender_id: send.userId,
          content: send.content,
          created_at: '2026-01-01',
          [field]: 'different',
        });
        expect((await sendTextMessage(send, () => true)).status).toBe('failed');
        expect(db.rows.size).toBe(1);
      },
    );
    it('does not use a hidden conflict as proof of delivery', async () => {
      db.intercept((q) =>
        q.op === 'insert' ? { data: null, error: { code: '23505' } } : undefined,
      );
      expect((await sendTextMessage(send, () => true)).status).toBe('failed');
    });
    it('checks parent access on every retry even if the exact ID was previously committed', async () => {
      await sendTextMessage(send, () => true);
      db.setAccess(false);
      expect(await sendTextMessage(send, () => true)).toEqual({ status: 'inaccessible' });
      expect(db.calls.filter((q) => q.op === 'insert')).toHaveLength(1);
    });
    it('stops after account/permission invalidation during a delayed authorized read', async () => {
      const read = deferred();
      db.intercept((q) => (q.table === table ? read.promise : undefined));
      let current = true;
      const promise = sendTextMessage(send, () => current);
      await Promise.resolve();
      await Promise.resolve();
      current = false;
      read.resolve({ data: null, error: null });
      expect(await promise).toEqual({ status: 'inaccessible' });
      expect(db.calls.filter((q) => q.op === 'insert')).toHaveLength(0);
    });
    it('does not resurrect a deleted identity with the V11 ledger (mock only)', async () => {
      await sendTextMessage(send, () => true);
      db.remove(table, send.id);
      expect((await sendTextMessage(send, () => true)).status).toBe('failed');
      expect(db.rows.size).toBe(0);
    });
    if (kind === 'mentorship')
      it.each(['pending', 'declined'])(
        'denies a %s request before dispatching an insert',
        async (status) => {
          db.setStatus(status);
          expect(await sendTextMessage(send, () => true)).toEqual({ status: 'inaccessible' });
          expect(db.calls.filter((q) => q.op === 'insert')).toHaveLength(0);
        },
      );
  });
}
