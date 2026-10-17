import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Alert, FlatList, RefreshControl, StyleSheet, Text } from 'react-native';
import * as RN from 'react-native';
import { supabase } from '../../lib/supabase';
import {
  CompactMessage,
  ConversationList,
  startsMessageCluster,
} from '../../components/CompactConversation';
import ChannelScreen from '../../app/(tabs)/chats/[channelId]';
import MentorshipScreen from '../../app/inbox/[requestId]';
import {
  setMessageRecoveryAccount,
  confirmMessageRecoveryMembership,
} from '../../lib/message-recovery';
import { createMessageDb } from '../helpers/message-db';
import type { ChannelMessage } from '../../lib/types';

const mockPush = jest.fn(),
  mockBack = jest.fn();
let mockAuth: any;
let mockParams = { channelId: 'room', requestId: 'room' };
jest.mock('../../lib/auth', () => ({ useAuth: () => mockAuth }));
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({ push: mockPush, back: mockBack }),
  useFocusEffect: jest.fn(),
  Link: ({ children, href, ...props }: any) => {
    const React = jest.requireActual<any>('react'),
      { Text } = jest.requireActual<any>('react-native');
    return React.createElement(Text, { ...props, onPress: () => mockPush(href) }, children);
  },
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
  toggleReaction: jest.fn(async () => ({ error: null })),
  useReactionSync: jest.fn(),
  QUICK_EMOJI: ['👍', '❤️'],
}));
jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual<any>('react-native-safe-area-context/jest/mock').default,
);
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
const message = (id: string, sender = 'peer', time = '2026-10-12T09:41:00Z'): ChannelMessage => ({
  id,
  channel_id: 'room',
  sender_id: sender,
  content: id,
  created_at: time,
});
let db: ReturnType<typeof createMessageDb>;
beforeEach(() => {
  jest.clearAllMocks();
  mockParams = { channelId: 'room', requestId: 'room' };
  mockAuth = {
    session: { user: { id: 'me' } },
    profile: {
      id: 'my-profile',
      user_id: 'me',
      chapter_id: 'chapter',
      name: 'QA Self',
      status: 'approved',
    },
    blockedIds: new Set(),
  };
  setMessageRecoveryAccount(null);
  setMessageRecoveryAccount('me');
  confirmMessageRecoveryMembership('me', 'chapter');
  db = createMessageDb();
  db.intercept((q) =>
    q.table === 'profiles'
      ? {
          data: [{ id: 'peer-profile', user_id: 'peer', name: 'QA Peer', avatar_url: null }],
          error: null,
        }
      : undefined,
  );
  (supabase.from as any).mockImplementation(db.from);
  (supabase.channel as any).mockImplementation(db.channel);
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
  setMessageRecoveryAccount(null);
});

describe('compact sender clusters', () => {
  it('groups adjacent senders but separates sender changes, dates and time gaps', () => {
    const first = message('one');
    expect(startsMessageCluster(first)).toBe(true);
    expect(startsMessageCluster(message('two'), first)).toBe(false);
    expect(startsMessageCluster(message('two', 'me'), first)).toBe(true);
    expect(startsMessageCluster(message('two', 'peer', '2026-10-12T10:00:00Z'), first)).toBe(true);
    expect(startsMessageCluster(message('two', 'peer', '2026-10-13T09:41:00Z'), first)).toBe(true);
  });
  it('shows name/avatar once, retains an accessible full timestamp per message, and opens profile/actions', () => {
    const action = jest.fn(),
      profile = jest.fn(),
      first = message('one');
    const screen = render(
      <>
        <CompactMessage
          message={first}
          mine={false}
          name="QA Peer"
          onProfile={profile}
          onActions={action}
        >
          <Text>First text</Text>
        </CompactMessage>
        <CompactMessage
          message={message('two')}
          previous={first}
          mine={false}
          name="QA Peer"
          onProfile={profile}
          onActions={action}
        >
          <Text>Next text</Text>
        </CompactMessage>
      </>,
    );
    expect(screen.getAllByText('QA Peer')).toHaveLength(1);
    expect(screen.getAllByLabelText("View QA Peer's profile")).toHaveLength(1);
    expect(screen.getAllByLabelText(/Message actions from QA Peer$/)).toHaveLength(2);
    fireEvent.press(screen.getByLabelText("View QA Peer's profile"));
    expect(profile).toHaveBeenCalledTimes(1);
    fireEvent.press(screen.getAllByLabelText(/Message actions from QA Peer$/)[1]);
    expect(action).toHaveBeenCalledTimes(1);
  });
  it('exposes every own mentorship timestamp once without requiring message actions', async () => {
    const first = { ...message('own-first', 'me'), request_id: 'room' };
    const second = { ...message('own-second', 'me', '2026-10-12T09:42:00Z'), request_id: 'room' };
    db.seed('messages', first);
    db.seed('messages', second);
    const screen = render(<MentorshipScreen />);
    await screen.findByText('own-second');
    for (const item of [first, second]) {
      const timestamp = new Date(item.created_at).toLocaleString([], {
        dateStyle: 'full',
        timeStyle: 'short',
      });
      expect(screen.getAllByLabelText(timestamp)).toHaveLength(1);
    }
    expect(screen.queryByLabelText(/Message actions from You/)).toBeNull();
    expect(screen.getAllByText('You')).toHaveLength(1);
  });
  it('does not repeat a message timestamp in its action announcement', () => {
    const item = message('peer-message');
    const timestamp = new Date(item.created_at).toLocaleString([], {
      dateStyle: 'full',
      timeStyle: 'short',
    });
    const screen = render(
      <CompactMessage message={item} mine={false} name="QA Peer" onActions={jest.fn()}>
        <Text>Peer message</Text>
      </CompactMessage>,
    );
    expect(screen.getAllByLabelText(timestamp)).toHaveLength(1);
    expect(
      screen.getByLabelText(/Message actions from QA Peer/).props.accessibilityLabel,
    ).not.toContain(timestamp);
  });
  it('allows enlarged, long sender names and multiline message text without truncation', () => {
    jest
      .spyOn(RN, 'useWindowDimensions')
      .mockReturnValue({ width: 360, height: 800, scale: 1, fontScale: 2 });
    const name = 'QA A very long member name that wraps';
    const screen = render(
      <CompactMessage message={message('one')} mine={false} name={name}>
        <Text>Long multiline\nmessage text</Text>
      </CompactMessage>,
    );
    expect(screen.getByText(name).props.numberOfLines).toBeUndefined();
    expect(screen.getByText(name).props.allowFontScaling).not.toBe(false);
    expect(screen.getByText(/Long multiline/)).toBeTruthy();
  });
});

describe('viewport and paging', () => {
  it('anchors prepended history; arrivals away from the bottom expose an explicit jump', () => {
    const scroll = jest.fn();
    jest
      .spyOn(FlatList.prototype, 'getScrollResponder')
      .mockReturnValue({ scrollToEnd: scroll } as any);
    const renderItem = ({ item }: any) => <Text>{item.content}</Text>;
    const newest = message('newest');
    const screen = render(
      <ConversationList messages={[newest]} renderItem={renderItem} empty={null} />,
    );
    let list = screen.UNSAFE_getByType(FlatList);
    act(() => list.props.onContentSizeChange(360, 1000));
    expect(scroll).toHaveBeenCalledTimes(1);
    fireEvent(screen.getByTestId('conversation-messages'), 'scrollBeginDrag', {});
    fireEvent.scroll(screen.getByTestId('conversation-messages'), {
      nativeEvent: {
        contentOffset: { y: 0 },
        contentSize: { height: 1500 },
        layoutMeasurement: { height: 500 },
      },
    });
    screen.rerender(
      <ConversationList
        messages={[message('older'), newest]}
        renderItem={renderItem}
        empty={null}
      />,
    );
    list = screen.UNSAFE_getByType(FlatList);
    act(() => list.props.onContentSizeChange(360, 1500));
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Jump to latest messages')).toBeTruthy();
    screen.rerender(
      <ConversationList
        messages={[message('older'), newest, message('arrival')]}
        renderItem={renderItem}
        empty={null}
      />,
    );
    list = screen.UNSAFE_getByType(FlatList);
    act(() => list.props.onContentSizeChange(360, 1600));
    expect(scroll).toHaveBeenCalledTimes(1);
    fireEvent.press(screen.getByLabelText('Jump to latest messages'));
    expect(scroll).toHaveBeenLastCalledWith({ animated: false });
    expect(screen.queryByLabelText('Jump to latest messages')).toBeNull();
    expect(list.props.maintainVisibleContentPosition).toEqual({ minIndexForVisible: 0 });
  });
  it('positions rendered long history through multiple layout passes until the reader takes control', () => {
    jest.useFakeTimers();
    const scroll = jest.fn();
    jest
      .spyOn(FlatList.prototype, 'getScrollResponder')
      .mockReturnValue({ scrollToEnd: scroll } as any);
    const messages = Array.from({ length: 60 }, (_, i) => message(`history-${i}`));
    const renderItem = ({ item }: any) => <Text>{item.content}</Text>;
    const screen = render(
      <ConversationList messages={messages} renderItem={renderItem} empty={null} />,
    );
    const layout = (height: number) => {
      const list = screen.UNSAFE_getByType(FlatList);
      act(() => list.props.onContentSizeChange(390, height));
    };
    layout(1200);
    layout(2600);
    layout(4200);
    expect(scroll).toHaveBeenCalledTimes(3);
    fireEvent(screen.getByTestId('conversation-messages'), 'scrollBeginDrag', {
      nativeEvent: { contentOffset: { y: 100 } },
    });
    fireEvent.scroll(screen.getByTestId('conversation-messages'), {
      nativeEvent: {
        contentOffset: { y: 100 },
        contentSize: { height: 4200 },
        layoutMeasurement: { height: 650 },
      },
    });
    layout(4400);
    expect(scroll).toHaveBeenCalledTimes(3);
    expect(screen.getByLabelText('Jump to latest messages')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Jump to latest messages'));
    layout(4600);
    expect(scroll).toHaveBeenCalledTimes(5);
    expect(screen.queryByLabelText('Jump to latest messages')).toBeNull();
    // Explicit paging ends bottom positioning before the prepend is measured.
    screen.rerender(
      <ConversationList
        messages={messages}
        renderItem={renderItem}
        empty={null}
        hasMore
        loadEarlier={jest.fn()}
      />,
    );
    fireEvent.press(screen.getByLabelText('Load earlier messages'));
    screen.rerender(
      <ConversationList
        messages={[message('earlier'), ...messages]}
        renderItem={renderItem}
        empty={null}
      />,
    );
    layout(4800);
    expect(scroll).toHaveBeenCalledTimes(5);
    act(() => jest.runOnlyPendingTimers());
    screen.unmount();
    jest.useRealTimers();
  });
  it('respects a reader gesture before the first content measurement', () => {
    const scroll = jest.fn();
    jest
      .spyOn(FlatList.prototype, 'getScrollResponder')
      .mockReturnValue({ scrollToEnd: scroll } as any);
    const screen = render(
      <ConversationList
        messages={[message('newest')]}
        renderItem={({ item }) => <Text>{item.content}</Text>}
        empty={null}
      />,
    );
    fireEvent(screen.getByTestId('conversation-messages'), 'scrollBeginDrag', {});
    act(() => screen.UNSAFE_getByType(FlatList).props.onContentSizeChange(390, 3000));
    expect(scroll).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Jump to latest messages')).toBeTruthy();
  });
  it('keeps paging actions at least 44 points and prevents duplicate paging while loading', () => {
    const load = jest.fn();
    const screen = render(
      <ConversationList
        messages={[]}
        renderItem={() => null}
        empty={null}
        hasMore
        loadEarlier={load}
      />,
    );
    fireEvent.press(screen.getByLabelText('Load earlier messages'));
    expect(load).toHaveBeenCalledTimes(1);
    expect(
      StyleSheet.flatten(screen.getByLabelText('Load earlier messages').props.style).minHeight,
    ).toBeGreaterThanOrEqual(44);
    screen.rerender(
      <ConversationList
        messages={[]}
        renderItem={() => null}
        empty={null}
        hasMore
        loadingEarlier
        loadEarlier={load}
      />,
    );
    fireEvent.press(screen.getByLabelText('Load earlier messages'));
    expect(load).toHaveBeenCalledTimes(1);
  });
});

describe('existing conversation screens', () => {
  it('keeps group profile/back routes, reactions, own/admin delete and reporting', async () => {
    db.seed('channel_messages', message('peer-msg'));
    db.seed('channel_messages', message('own-msg', 'me'));
    const alert = jest.spyOn(Alert, 'alert');
    const screen = render(<ChannelScreen />);
    await screen.findByText('peer-msg');
    await waitFor(() => expect(screen.getByText('QA Peer')).toBeTruthy());
    fireEvent.press(screen.getByLabelText("View QA Peer's profile"));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/profile/[id]',
      params: { id: 'peer-profile' },
    });
    fireEvent.press(screen.getByLabelText('Go back'));
    expect(mockBack).toHaveBeenCalled();
    fireEvent.press(screen.getByLabelText(/Message actions from QA Peer$/));
    let choices = alert.mock.calls.at(-1)![2]!;
    expect(choices.map((c) => c.text)).toEqual(['👍', '❤️', 'Report message', 'Cancel']);
    fireEvent.press(screen.getByLabelText(/Message actions from You$/));
    choices = alert.mock.calls.at(-1)![2]!;
    expect(choices.some((c) => c.text === 'Delete message')).toBe(true);
    expect(choices.some((c) => c.text === 'Report message')).toBe(false);
    mockAuth = { ...mockAuth, profile: { ...mockAuth.profile, admin_role: 'manager' } };
    screen.rerender(<ChannelScreen />);
    fireEvent.press(screen.getByLabelText(/Message actions from QA Peer$/));
    expect(alert.mock.calls.at(-1)![2]!.some((c) => c.text === 'Delete message (admin)')).toBe(
      true,
    );
  });
  it('keeps supported event/job detail links inside compact group messages', async () => {
    const id = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000099';
    db.seed('channel_messages', {
      ...message('shared'),
      content: `Shared event /events/${id}\nShared job /jobs/${id}`,
    });
    const screen = render(<ChannelScreen />);
    fireEvent.press(await screen.findByLabelText('Open event'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/events/[id]', params: { id } });
    fireEvent.press(screen.getByLabelText('Open job posting'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/jobs/[id]', params: { id } });
  });
  it('uses accepted request state and preserves mentorship profile/report/block actions', async () => {
    db.seed('messages', { ...message('mentor-message'), request_id: 'room' });
    const alert = jest.spyOn(Alert, 'alert');
    const screen = render(<MentorshipScreen />);
    await screen.findByText('mentor-message');
    expect(screen.getByText('Mentorship accepted')).toBeTruthy();
    await waitFor(() =>
      expect(screen.getAllByLabelText("View QA Peer's profile").length).toBeGreaterThan(0),
    );
    fireEvent.press(screen.getAllByLabelText("View QA Peer's profile")[0]);
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/profile/[id]',
      params: { id: 'peer-profile' },
    });
    fireEvent.press(screen.getByLabelText(/Message actions from QA Peer$/));
    expect(alert.mock.calls.at(-1)![2]!.map((c) => c.text)).toEqual([
      'Report message',
      'Block QA Peer',
      'Cancel',
    ]);
  });
  it('explicitly refreshes a healthy mentorship after a missed message event', async () => {
    db.seed('messages', { ...message('already-loaded'), request_id: 'room' });
    const screen = render(<MentorshipScreen />);
    await screen.findByText('already-loaded');
    db.seed('messages', {
      ...message('missed-message', 'peer', '2026-10-12T10:00:00Z'),
      request_id: 'room',
    });
    expect(screen.queryByText('missed-message')).toBeNull();
    fireEvent.press(screen.getByLabelText('Refresh conversation'));
    await screen.findByText('missed-message');
    expect(screen.getByText('already-loaded')).toBeTruthy();
    expect(screen.getByLabelText('Message draft')).toBeTruthy();
    db.seed('messages', {
      ...message('missed-pull-refresh', 'peer', '2026-10-12T10:01:00Z'),
      request_id: 'room',
    });
    fireEvent(screen.UNSAFE_getByType(RefreshControl), 'refresh');
    await screen.findByText('missed-pull-refresh');
  });
  it('refreshes missed request acceptance and decline without an existing error', async () => {
    db.setStatus('pending');
    db.seed('messages', { ...message('accepted-history'), request_id: 'room' });
    const screen = render(<MentorshipScreen />);
    await screen.findByText('Waiting for a response…');
    expect(screen.queryByLabelText('Message draft')).toBeNull();
    db.setStatus('accepted');
    fireEvent.press(screen.getByLabelText('Refresh conversation'));
    await screen.findByText('accepted-history');
    expect(screen.getByLabelText('Message draft')).toBeTruthy();
    db.setStatus('declined');
    fireEvent.press(screen.getByLabelText('Refresh conversation'));
    await screen.findByText('This request was declined.');
    expect(screen.queryByText('accepted-history')).toBeNull();
    expect(screen.queryByLabelText('Message draft')).toBeNull();
  });
  it.each(['pending', 'declined'] as const)(
    'retains %s controls without accepted context, messages or composer',
    async (status) => {
      db.setStatus(status);
      db.seed('messages', { ...message('private-message'), request_id: 'room' });
      const screen = render(<MentorshipScreen />);
      await waitFor(() => expect(screen.queryByText('Mentorship request')).toBeTruthy());
      expect(screen.queryByText('Mentorship accepted')).toBeNull();
      expect(screen.queryByText('private-message')).toBeNull();
      expect(screen.queryByLabelText('Message draft')).toBeNull();
      expect(
        screen.getByText(
          status === 'pending' ? 'Waiting for a response…' : 'This request was declined.',
        ),
      ).toBeTruthy();
    },
  );
  it('retains incoming pending Accept/Decline actions', async () => {
    db.setStatus('pending');
    mockAuth.session.user.id = 'peer';
    setMessageRecoveryAccount('peer');
    confirmMessageRecoveryMembership('peer', 'chapter');
    const screen = render(<MentorshipScreen />);
    await screen.findByText('Accept');
    expect(screen.getByText('Decline')).toBeTruthy();
    expect(screen.queryByLabelText('Message draft')).toBeNull();
  });
});
