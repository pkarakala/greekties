import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  setMessageRecoveryAccount,
  confirmMessageRecoveryMembership,
  getMessageRecovery,
  editMessageDraft,
  submitRecoveredMessage,
  confirmRecoveredMessage,
  forgetDeletedMessage,
  discardSavedAttempt,
  recoveryIsCurrent,
  SEND_TIMEOUT_MS,
} from '../../lib/message-recovery';
import { type SendIdentity, type SendResult } from '../../lib/message-send';
import { deferred } from '../helpers/message-db';
jest.mock('../../lib/supabase', () => ({ supabase: {} }));

for (const kind of ['channel', 'mentorship'] as const)
  describe(`${kind} session draft recovery`, () => {
    const message = (send: SendIdentity) =>
      ({
        id: send.id,
        sender_id: send.userId,
        content: send.content,
        [kind === 'channel' ? 'channel_id' : 'request_id']: send.conversationId,
        created_at: '2026-01-01',
      }) as any;
    const entry = () => getMessageRecovery(kind, 'room', 'me')!;
    beforeEach(() => {
      setMessageRecoveryAccount(null);
      setMessageRecoveryAccount('me');
      confirmMessageRecoveryMembership('me', 'chapter');
    });
    afterEach(() => {
      jest.useRealTimers();
    });
    it('locks synchronously against rapid taps; retains submitted text separately from newer typing', async () => {
      const pending = deferred<SendResult>();
      const transport = jest.fn(() => pending.promise);
      editMessageDraft(entry(), 'First');
      const send = submitRecoveredMessage(entry(), false, transport, () => 'first');
      void submitRecoveredMessage(entry(), false, transport, () => 'duplicate');
      expect(entry().state.attempt?.content).toBe('First');
      editMessageDraft(entry(), 'Newer typing');
      await Promise.resolve();
      expect(transport).toHaveBeenCalledTimes(1);
      pending.resolve({ status: 'confirmed', message: message(entry().state.attempt!) });
      await send;
      expect(entry().state.draft).toBe('Newer typing');
      expect(entry().state.attempt).toBeNull();
    });
    it.each(['failed', 'uncertain', 'throw'] as const)(
      'preserves newer draft and stable retry identity after %s',
      async (status) => {
        const pending = deferred<SendResult>();
        editMessageDraft(entry(), 'Submitted');
        const promise = submitRecoveredMessage(
          entry(),
          false,
          () => pending.promise,
          () => 'stable',
        );
        editMessageDraft(entry(), 'New text');
        if (status === 'throw') pending.reject(new Error('network'));
        else pending.resolve({ status });
        await promise;
        expect(entry().state.draft).toBe('New text');
        expect(entry().state.attempt?.content).toBe('Submitted');
        const retry = jest.fn(async (send: SendIdentity): Promise<SendResult> => ({
          status: 'confirmed',
          message: message(send),
        }));
        await submitRecoveredMessage(entry(), true, retry, () => 'must-not-generate');
        expect(retry.mock.calls[0][0].id).toBe('stable');
        expect(entry().state.draft).toBe('New text');
      },
    );
    it('keeps a preexisting uncertain outcome uncertain when a retry is denied', async () => {
      editMessageDraft(entry(), 'Maybe sent');
      await submitRecoveredMessage(
        entry(),
        false,
        async () => ({ status: 'uncertain' }),
        () => 'stable',
      );
      await submitRecoveredMessage(entry(), true, async () => ({ status: 'failed' }));
      expect(entry().state.attempt?.status).toBe('uncertain');
    });
    it('times out without a stuck spinner and ignores an older response after a retry', async () => {
      jest.useFakeTimers();
      const pending = deferred<SendResult>();
      editMessageDraft(entry(), 'Message');
      const promise = submitRecoveredMessage(
        entry(),
        false,
        () => pending.promise,
        () => 'stable',
      );
      const original = entry().state.attempt!;
      await jest.advanceTimersByTimeAsync(SEND_TIMEOUT_MS);
      await promise;
      expect(entry().state.attempt?.status).toBe('uncertain');
      await submitRecoveredMessage(entry(), true, async () => ({
        status: 'confirmed',
        message: message(original),
      }));
      editMessageDraft(entry(), 'Next');
      pending.resolve({ status: 'failed' });
      await Promise.resolve();
      expect(entry().state.attempt).toBeNull();
      expect(entry().state.draft).toBe('Next');
    });
    it('accepts realtime/authorized-fetch confirmation before response without later downgrading it', async () => {
      const pending = deferred<SendResult>();
      editMessageDraft(entry(), 'Message');
      const promise = submitRecoveredMessage(
        entry(),
        false,
        () => pending.promise,
        () => 'stable',
      );
      confirmRecoveredMessage(entry(), message(entry().state.attempt!));
      pending.resolve({ status: 'failed' });
      await promise;
      expect(entry().state.attempt).toBeNull();
      expect(entry().state.confirmed).toHaveLength(1);
    });
    it('retains a draft/attempt when re-entered and same-account membership is revalidated', async () => {
      editMessageDraft(entry(), 'Message');
      await submitRecoveredMessage(
        entry(),
        false,
        async () => ({ status: 'uncertain' }),
        () => 'stable',
      );
      editMessageDraft(entry(), 'Next draft');
      const prior = entry();
      setMessageRecoveryAccount('me');
      confirmMessageRecoveryMembership('me', 'chapter');
      expect(entry()).toBe(prior);
      expect(entry().state.attempt?.id).toBe('stable');
      expect(entry().state.draft).toBe('Next draft');
      expect(getMessageRecovery(kind, 'another-room', 'me')?.state.draft).toBe('');
    });
    it.each(['logout', 'account', 'membership', 'chapter'] as const)(
      'discards private state on %s and ignores late completions even after returning',
      async (reason) => {
        const pending = deferred<SendResult>();
        const old = entry();
        editMessageDraft(old, 'Private');
        const promise = submitRecoveredMessage(
          old,
          false,
          () => pending.promise,
          () => 'old',
        );
        const sent = old.state.attempt!;
        if (reason === 'logout') setMessageRecoveryAccount(null);
        if (reason === 'account') setMessageRecoveryAccount('someone');
        if (reason === 'membership') confirmMessageRecoveryMembership('me', null);
        if (reason === 'chapter') confirmMessageRecoveryMembership('me', 'other-chapter');
        expect(old.state.draft).toBe('');
        expect(old.state.attempt).toBeNull();
        expect(recoveryIsCurrent(old)).toBe(false);
        setMessageRecoveryAccount('me');
        confirmMessageRecoveryMembership('me', 'chapter');
        editMessageDraft(entry(), 'Fresh');
        pending.resolve({ status: 'confirmed', message: message(sent) });
        await promise;
        expect(entry().state.draft).toBe('Fresh');
        expect(entry().state.confirmed).toHaveLength(0);
      },
    );
    it('makes observed deletion terminal, including against a late send response', async () => {
      const pending = deferred<SendResult>();
      editMessageDraft(entry(), 'Delete me');
      const promise = submitRecoveredMessage(
        entry(),
        false,
        () => pending.promise,
        () => 'stable',
      );
      const sent = entry().state.attempt!;
      forgetDeletedMessage(entry(), sent.id);
      pending.resolve({ status: 'confirmed', message: message(sent) });
      await promise;
      expect(entry().state.attempt).toBeNull();
      expect(entry().state.confirmed).toHaveLength(0);
    });
    it('leaves the draft intact when UUID creation fails and supports explicit discard of a failed attempt', async () => {
      editMessageDraft(entry(), 'Keep');
      await submitRecoveredMessage(
        entry(),
        false,
        async () => ({ status: 'failed' }),
        () => {
          throw new Error('uuid unavailable');
        },
      );
      expect(entry().state.draft).toBe('Keep');
      expect(entry().state.error).toContain('draft is still here');
      await submitRecoveredMessage(
        entry(),
        false,
        async () => ({ status: 'failed' }),
        () => 'stable',
      );
      editMessageDraft(entry(), 'Newer');
      discardSavedAttempt(entry());
      expect(entry().state.attempt).toBeNull();
      expect(entry().state.draft).toBe('Newer');
    });
  });
