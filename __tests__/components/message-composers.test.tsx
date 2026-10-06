import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { uuid } from 'expo-modules-core';
import { Alert, Platform } from 'react-native';
import { supabase } from '../../lib/supabase';
import ChannelScreen from '../../app/(tabs)/chats/[channelId]';
import MentorshipScreen from '../../app/inbox/[requestId]';
import {
  setMessageRecoveryAccount,
  confirmMessageRecoveryMembership,
  getMessageRecovery,
  submitRecoveredMessage,
} from '../../lib/message-recovery';
import { createMessageDb, deferred } from '../helpers/message-db';

let mockParams = { channelId: 'room', requestId: 'room' };
let mockAuth = {
  session: { user: { id: 'me' } },
  profile: { chapter_id: 'chapter', status: 'approved' },
  blockedIds: new Set<string>(),
};
jest.mock('../../lib/auth', () => ({ useAuth: () => mockAuth }));
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
  useFocusEffect: jest.fn(),
}));
jest.mock('../../lib/supabase', () => ({
  supabase: { from: jest.fn(), channel: jest.fn(), removeChannel: jest.fn() },
}));
jest.mock('../../lib/reads', () => ({
  markChannelRead: jest.fn(async () => {}),
  getLastRead: jest.fn(),
  getServerLastReads: jest.fn(),
}));
jest.mock('../../lib/reactions', () => ({
  fetchReactions: jest.fn(async () => new Map()),
  toggleReaction: jest.fn(),
  useReactionSync: jest.fn(),
  QUICK_EMOJI: [],
}));
jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual<any>('react-native-safe-area-context/jest/mock').default,
);
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

function confirmationHandler(screen: ReturnType<typeof render>): () => void {
  // Match fireEvent's parent traversal to retain the actual Pressable callback,
  // rather than the host View's responder props, for stale-event tests only.
  let node = screen.getByLabelText('Confirm discard saved message');
  while (typeof node.props.onPress !== 'function') {
    if (!node.parent) throw new Error('Confirmation must have an actionable handler');
    node = node.parent;
  }
  return node.props.onPress;
}

for (const kind of ['channel', 'mentorship'] as const)
  describe(`${kind} actual composer screen`, () => {
    const Screen = kind === 'channel' ? ChannelScreen : MentorshipScreen;
    const table = kind === 'channel' ? 'channel_messages' : 'messages';
    const column = kind === 'channel' ? 'channel_id' : 'request_id';
    let db: ReturnType<typeof createMessageDb>;
    beforeEach(() => {
      mockParams = { channelId: 'room', requestId: 'room' };
      mockAuth = {
        session: { user: { id: 'me' } },
        profile: { chapter_id: 'chapter', status: 'approved' },
        blockedIds: new Set(),
      };
      setMessageRecoveryAccount(null);
      setMessageRecoveryAccount('me');
      confirmMessageRecoveryMembership('me', 'chapter');
      db = createMessageDb();
      db.seed(table, {
        id: 'existing',
        [column]: 'room',
        sender_id: 'me',
        content: 'Already loaded',
        created_at: '2026-01-01',
      });
      (supabase.from as any).mockImplementation(db.from);
      (supabase.channel as any).mockImplementation(db.channel);
      let next = 0;
      jest.spyOn(uuid, 'v4').mockImplementation(() => `send-${++next}`);
    });
    afterEach(() => {
      jest.restoreAllMocks();
    });
    it('ignores empty input, handles rapid taps, and preserves newer typing on older success', async () => {
      const screen = render(<Screen />);
      const input = await screen.findByLabelText('Message draft');
      fireEvent.changeText(input, '   ');
      fireEvent.press(screen.getByLabelText('Send message'));
      expect(db.calls.filter((q) => q.op === 'insert')).toHaveLength(0);
      const pending = deferred();
      db.intercept((q) => (q.op === 'insert' ? pending.promise.then(() => db.base(q)) : undefined));
      fireEvent.changeText(input, 'Submitted');
      const send = screen.getByLabelText('Send message');
      act(() => {
        fireEvent.press(send);
        fireEvent.press(send);
      });
      fireEvent.changeText(screen.getByLabelText('Message draft'), 'Newer typing');
      await waitFor(() => expect(db.calls.filter((q) => q.op === 'insert')).toHaveLength(1));
      expect(screen.getByText('Submitted')).toBeTruthy();
      expect(screen.getByText(/Sending…/)).toBeTruthy();
      await act(async () => {
        pending.resolve(null);
      });
      await waitFor(() => expect(screen.queryByText(/Sending…/)).toBeNull());
      expect(screen.getByLabelText('Message draft').props.value).toBe('Newer typing');
      expect(screen.getAllByText('Submitted')).toHaveLength(1);
    });
    it.each(['denied', 'network'] as const)(
      'offers accessible recovery after %s without erasing loaded messages/newer typing',
      async (failure) => {
        const screen = render(<Screen />);
        await screen.findByLabelText('Message draft');
        const pending = deferred();
        db.intercept((q) => (q.op === 'insert' ? pending.promise : undefined));
        fireEvent.changeText(screen.getByLabelText('Message draft'), 'Recover this');
        fireEvent.press(screen.getByLabelText('Send message'));
        fireEvent.changeText(screen.getByLabelText('Message draft'), 'A newer draft');
        await act(async () => {
          if (failure === 'denied') pending.resolve({ data: null, error: { code: '42501' } });
          else pending.reject(new Error('offline'));
        });
        await screen.findByLabelText('Retry message');
        expect(screen.getByText('Already loaded')).toBeTruthy();
        expect(screen.getByText('Recover this')).toBeTruthy();
        expect(screen.getByLabelText('Message draft').props.value).toBe('A newer draft');
        expect(screen.queryByLabelText('Reload messages')).toBeNull();
        db.intercept(null);
        act(() => {
          fireEvent.press(screen.getByLabelText('Retry message'));
          fireEvent.press(screen.getByLabelText('Retry message'));
        });
        await waitFor(() => expect(screen.queryByLabelText('Retry message')).toBeNull());
        const inserts = db.calls.filter((q) => q.op === 'insert');
        expect(inserts.map((q) => q.row.id)).toEqual(['send-1', 'send-1']);
        expect(screen.getByLabelText('Message draft').props.value).toBe('A newer draft');
        expect(screen.getAllByText('Recover this')).toHaveLength(1);
      },
    );
    it('recovers a failed attempt and draft on navigation back; route/account changes do not show private text', async () => {
      const first = render(<Screen />);
      await first.findByLabelText('Message draft');
      db.intercept((q) =>
        q.op === 'insert' ? { data: null, error: { code: '42501' } } : undefined,
      );
      fireEvent.changeText(first.getByLabelText('Message draft'), 'Private submitted text');
      fireEvent.press(first.getByLabelText('Send message'));
      await first.findByLabelText('Retry message');
      fireEvent.changeText(first.getByLabelText('Message draft'), 'Private next draft');
      first.unmount();
      mockParams = { channelId: 'other', requestId: 'other' };
      const other = render(<Screen />);
      await other.findByLabelText('Message draft');
      expect(other.getByLabelText('Message draft').props.value).toBe('');
      expect(other.queryByText('Private submitted text')).toBeNull();
      other.unmount();
      mockParams = { channelId: 'room', requestId: 'room' };
      const reopened = render(<Screen />);
      await reopened.findByLabelText('Retry message');
      expect(reopened.getByLabelText('Message draft').props.value).toBe('Private next draft');
      expect(db.calls.filter((q) => q.op === 'insert')).toHaveLength(1);
      await act(async () => {
        setMessageRecoveryAccount('someone');
        confirmMessageRecoveryMembership('someone', 'chapter');
      });
      mockAuth = { ...mockAuth, session: { user: { id: 'someone' } } };
      reopened.rerender(<Screen />);
      await waitFor(() => expect(reopened.queryByText('Private submitted text')).toBeNull());
      expect(reopened.queryByDisplayValue('Private next draft')).toBeNull();
    });
    describe.each(['web', 'ios', 'android'] as const)('%s discard confirmation', (platform) => {
      const originalOS = Platform.OS;
      beforeEach(() => {
        Platform.OS = platform;
        if (platform === 'web') {
          // Use the installed web implementation. The regression must click
          // rendered controls, not manually invoke nonexistent Alert callbacks.
          const webAlert = jest.requireActual<any>('react-native-web/dist/cjs/exports/Alert');
          jest.spyOn(Alert, 'alert').mockImplementation(webAlert.alert);
        }
      });
      afterEach(() => {
        Platform.OS = originalOS;
      });

      it.each(['failed', 'uncertain'] as const)(
        'provides actionable inline discard for a %s attempt; cancel preserves text and confirm enables the newer draft',
        async (status) => {
          const screen = render(<Screen />);
          await screen.findByLabelText('Message draft');
          db.intercept((q) =>
            q.op === 'insert'
              ? status === 'failed'
                ? { data: null, error: { code: '42501' } }
                : Promise.reject(new Error('offline'))
              : undefined,
          );
          fireEvent.changeText(screen.getByLabelText('Message draft'), 'Saved attempt');
          fireEvent.press(screen.getByLabelText('Send message'));
          await screen.findByLabelText('Discard saved message');
          fireEvent.changeText(screen.getByLabelText('Message draft'), 'Newer draft');
          fireEvent.press(screen.getByLabelText('Discard saved message'));
          expect(screen.getByText('Discard saved message?')).toBeTruthy();
          expect(screen.getByText(/does not delete.*cancel a send/)).toBeTruthy();
          const canceledConfirm = confirmationHandler(screen);
          fireEvent.press(screen.getByLabelText('Cancel discard saved message'));
          act(() => {
            canceledConfirm();
          });
          expect(screen.queryByLabelText('Confirm discard saved message')).toBeNull();
          expect(screen.getByText('Saved attempt')).toBeTruthy();
          expect(screen.getByLabelText('Message draft').props.value).toBe('Newer draft');
          expect(screen.getByLabelText('Send message').props.accessibilityState.disabled).toBe(
            true,
          );

          fireEvent.press(screen.getByLabelText('Discard saved message'));
          fireEvent.changeText(screen.getByLabelText('Message draft'), 'Even newer typing');
          fireEvent.press(screen.getByLabelText('Confirm discard saved message'));
          expect(screen.queryByText('Saved attempt')).toBeNull();
          expect(screen.queryByLabelText('Confirm discard saved message')).toBeNull();
          expect(screen.getByLabelText('Message draft').props.value).toBe('Even newer typing');
          expect(screen.getByLabelText('Send message').props.accessibilityState.disabled).toBe(
            false,
          );
          expect(db.calls.filter((q) => q.op === 'insert')).toHaveLength(1);
          db.intercept(null);
          fireEvent.press(screen.getByLabelText('Send message'));
          await waitFor(() => expect(db.calls.filter((q) => q.op === 'insert')).toHaveLength(2));
          await waitFor(() => expect(screen.queryByText(/Sending…/)).toBeNull());
          expect(db.calls.filter((q) => q.op === 'insert').map((q) => q.row.id)).toEqual([
            'send-1',
            'send-2',
          ]);
          expect(screen.getAllByText('Even newer typing')).toHaveLength(1);
        },
      );

      async function openConfirmation() {
        const screen = render(<Screen />);
        await screen.findByLabelText('Message draft');
        db.intercept((q) =>
          q.op === 'insert' ? Promise.reject(new Error('lost response')) : undefined,
        );
        fireEvent.changeText(screen.getByLabelText('Message draft'), 'Attempt A');
        fireEvent.press(screen.getByLabelText('Send message'));
        await screen.findByLabelText('Discard saved message');
        fireEvent.changeText(screen.getByLabelText('Message draft'), 'Newer typing');
        fireEvent.press(screen.getByLabelText('Discard saved message'));
        // Successful web behavior is tested above by clicking rendered buttons.
        // Here retain a handler only to simulate a stale queued event after a
        // lifecycle transition has removed the actionable confirmation.
        const staleConfirm = confirmationHandler(screen);
        return { screen, staleConfirm };
      }
      const saved = () => getMessageRecovery(kind, 'room', 'me')!;

      it('ignores confirmation A after late settlement and a replacement attempt B', async () => {
        const { screen, staleConfirm } = await openConfirmation();
        const inserted = db.calls.find((q) => q.op === 'insert')!.row;
        db.seed(table, { ...inserted, created_at: '2026-09-17T12:00:00Z' });
        await act(async () => {
          db.emit(table, 'INSERT', inserted);
        });
        await waitFor(() =>
          expect(screen.queryByLabelText('Confirm discard saved message')).toBeNull(),
        );
        expect(saved().state.attempt).toBeNull();
        fireEvent.press(screen.getByLabelText('Send message'));
        await screen.findByLabelText('Discard saved message');
        fireEvent.changeText(screen.getByLabelText('Message draft'), 'Draft after B');
        fireEvent.press(screen.getByLabelText('Discard saved message'));
        act(() => {
          staleConfirm();
        });
        expect(saved().state.attempt?.id).toBe('send-2');
        expect(screen.getByLabelText('Confirm discard saved message')).toBeTruthy();
        expect(screen.getByLabelText('Message draft').props.value).toBe('Draft after B');
        fireEvent.press(screen.getByLabelText('Confirm discard saved message'));
        expect(saved().state.attempt).toBeNull();
        expect(screen.getByLabelText('Message draft').props.value).toBe('Draft after B');
      });

      it('invalidates the confirmation when the same ID is retried, both pending and after failure', async () => {
        const { screen, staleConfirm } = await openConfirmation();
        const pending = deferred();
        db.intercept((q) => (q.op === 'insert' ? pending.promise : undefined));
        let retry!: Promise<void>;
        act(() => {
          // Another mounted recovery consumer can retry this same conversation.
          retry = submitRecoveredMessage(saved(), true);
          staleConfirm(); // Also guard before React has rendered pending state.
        });
        expect(saved().state.attempt?.status).toBe('pending');
        expect(screen.queryByLabelText('Confirm discard saved message')).toBeNull();
        await waitFor(() => expect(db.calls.filter((q) => q.op === 'insert')).toHaveLength(2));
        await act(async () => {
          pending.resolve({ data: null, error: { code: '42501' } });
          await retry;
        });
        expect(saved().state.attempt?.id).toBe('send-1');
        expect(screen.queryByLabelText('Confirm discard saved message')).toBeNull();
        act(() => {
          staleConfirm();
        });
        expect(saved().state.attempt?.id).toBe('send-1');
        expect(screen.getByLabelText('Message draft').props.value).toBe('Newer typing');
        fireEvent.press(screen.getByLabelText('Discard saved message'));
        fireEvent.press(screen.getByLabelText('Confirm discard saved message'));
        expect(saved().state.attempt).toBeNull();
      });

      it('drops open confirmation on conversation changes and cannot replay it after returning', async () => {
        const { screen, staleConfirm } = await openConfirmation();
        mockParams = { channelId: 'other', requestId: 'other' };
        screen.rerender(<Screen />);
        await screen.findByLabelText('Message draft');
        expect(screen.queryByLabelText('Confirm discard saved message')).toBeNull();
        fireEvent.changeText(screen.getByLabelText('Message draft'), 'Other conversation draft');
        act(() => {
          staleConfirm();
        });
        expect(saved().state.attempt?.id).toBe('send-1');
        expect(screen.getByLabelText('Message draft').props.value).toBe('Other conversation draft');
        mockParams = { channelId: 'room', requestId: 'room' };
        screen.rerender(<Screen />);
        await screen.findByLabelText('Discard saved message');
        expect(screen.queryByLabelText('Confirm discard saved message')).toBeNull();
        act(() => {
          staleConfirm();
        });
        expect(saved().state.attempt?.id).toBe('send-1');
        expect(screen.getByLabelText('Message draft').props.value).toBe('Newer typing');
      });

      it('does not let an unmounted confirmation discard recovery, even after remount', async () => {
        const { screen, staleConfirm } = await openConfirmation();
        screen.unmount();
        act(() => {
          staleConfirm();
        });
        expect(saved().state.attempt?.id).toBe('send-1');
        const reopened = render(<Screen />);
        await reopened.findByLabelText('Discard saved message');
        expect(reopened.queryByLabelText('Confirm discard saved message')).toBeNull();
        act(() => {
          staleConfirm();
        });
        expect(saved().state.attempt?.id).toBe('send-1');
        expect(reopened.getByLabelText('Message draft').props.value).toBe('Newer typing');
      });

      it.each(['logout', 'account switch', 'membership loss'] as const)(
        'invalidates confirmation on %s before any stale handler can act on a fresh attempt',
        async (transition) => {
          const { screen, staleConfirm } = await openConfirmation();
          act(() => {
            if (transition === 'membership loss') confirmMessageRecoveryMembership('me', null);
            else setMessageRecoveryAccount(transition === 'logout' ? null : 'another');
            staleConfirm();
          });
          expect(screen.queryByLabelText('Confirm discard saved message')).toBeNull();
          expect(screen.queryByDisplayValue('Newer typing')).toBeNull();
          act(() => {
            setMessageRecoveryAccount('me');
            confirmMessageRecoveryMembership('me', 'chapter');
          });
          await screen.findByLabelText('Message draft');
          expect(screen.getByLabelText('Message draft').props.value).toBe('');
          fireEvent.changeText(screen.getByLabelText('Message draft'), 'Fresh attempt');
          fireEvent.press(screen.getByLabelText('Send message'));
          await screen.findByLabelText('Discard saved message');
          fireEvent.changeText(screen.getByLabelText('Message draft'), 'Fresh draft');
          act(() => {
            staleConfirm();
          });
          expect(saved().state.attempt?.id).toBe('send-2');
          expect(screen.getByLabelText('Message draft').props.value).toBe('Fresh draft');
        },
      );
    });
    if (kind === 'mentorship')
      it('exposes no composer for a pending/declined mentorship request', async () => {
        db.setStatus('pending');
        const screen = render(<Screen />);
        await screen.findByText('Waiting for a response…');
        expect(screen.queryByLabelText('Message draft')).toBeNull();
        db.setStatus('declined');
        await act(async () => {
          db.emit('mentorship_requests', 'UPDATE', { id: 'room' });
        });
        await screen.findByText('This request was declined.');
        expect(screen.queryByLabelText('Message draft')).toBeNull();
      });
  });
