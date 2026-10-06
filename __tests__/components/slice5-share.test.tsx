import { beforeEach, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Text, Platform } from 'react-native';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChatShareReview } from '@/components/ChatShareReview';
import { ShareToChat } from '@/components/ShareToChat';
import { ChannelMessageText } from '@/components/ChannelMessageText';
import {
  getChatShare,
  prepareChatShare,
  appendChatShare,
  parseDetailLink,
  listShareChannels,
  cancelChatShare,
} from '@/lib/chat-share';
import {
  confirmMessageRecoveryMembership,
  setMessageRecoveryAccount,
  getMessageRecovery,
  editMessageDraft,
  useMessageRecovery,
  submitRecoveredMessage,
  discardConversationRecovery,
} from '@/lib/message-recovery';
import { MessageComposer } from '@/components/MessageComposer';
import { slice5Db, deferred, type Result } from '../helpers/slice5-db';
import EventDetail from '@/app/events/[id]';
import JobDetail from '@/app/jobs/[id]';

jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn(), rpc: jest.fn() } }));
jest.mock('@/lib/auth', () => ({ useAuth: jest.fn() }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('expo-router', () => ({
  useRouter: jest.fn(),
  useLocalSearchParams: jest.fn(),
  useFocusEffect: jest.fn(),
  Link: ({ children, accessibilityLabel, href }: any) => {
    const React = jest.requireActual<any>('react');
    const { Text } = jest.requireActual<any>('react-native');
    return React.createElement(
      Text,
      { accessibilityRole: 'link', accessibilityLabel, onPress: () => mockPush(href) },
      children,
    );
  },
}));
jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual<any>('react-native-safe-area-context/jest/mock').default,
);
const mockPush = jest.fn(),
  back = jest.fn();
const resource = { kind: 'events' as const, id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' };
let db: ReturnType<typeof slice5Db>, auth: any;
beforeEach(() => {
  jest.clearAllMocks();
  db = slice5Db();
  auth = {
    session: { user: { id: 'user' } },
    profile: { chapter_id: 'chapter', status: 'approved' },
    blockedIds: new Set(),
  };
  jest.mocked(useAuth).mockImplementation(() => auth);
  jest.mocked(useRouter).mockReturnValue({ push: mockPush, back } as any);
  jest.mocked(useLocalSearchParams).mockReturnValue({ id: resource.id });
  jest.mocked(supabase.from).mockImplementation(db.from);
  (jest.mocked(supabase.rpc) as any).mockResolvedValue({ data: true, error: null });
  db.rows.events = [
    {
      id: resource.id,
      title: 'Chapter dinner',
      chapter_id: 'chapter',
      created_by: 'user',
      category: 'social',
      starts_at: '2099-01-01T12:00:00Z',
      ends_at: null,
    },
  ];
  db.rows.channels = [{ id: 'channel', chapter_id: 'chapter', name: 'general' }];
  setMessageRecoveryAccount(null);
  setMessageRecoveryAccount('user');
  confirmMessageRecoveryMembership('user', 'chapter');
});
function Harness({ shareId }: { shareId: string }) {
  const composer = useMessageRecovery('channel', 'channel', 'user');
  return (
    <>
      <ChatShareReview entry={composer.entry} shareId={shareId} />
      <MessageComposer composer={composer} />
      <Text>{composer.draft}</Text>
    </>
  );
}
it('selects a channel, prepares a review, and never sends automatically', async () => {
  const ui = render(<ShareToChat resource={resource} />);
  fireEvent.press(ui.getByText('Share to chat'));
  fireEvent.press(await ui.findByText('# general'));
  await waitFor(() => expect(mockPush).toHaveBeenCalledTimes(1));
  const params = mockPush.mock.calls[0][0] as any;
  expect(params.params.channelId).toBe('channel');
  const entry = getMessageRecovery('channel', 'channel', 'user')!;
  expect(entry.state.draft).toBe('');
  expect(entry.state.attempt).toBeNull();
  expect(getChatShare(entry, params.params.shareId)?.text).toBe(
    `Chapter dinner\n/events/${resource.id}`,
  );
  expect(db.calls.some((c) => c.steps.some((s) => s[0] === 'insert'))).toBe(false);
});
it.each(['empty', 'existing', 'pending', 'failed'] as const)(
  'adds a reviewed share to %s recovery without modifying the attempt',
  async (mode) => {
    const entry = getMessageRecovery('channel', 'channel', 'user')!;
    if (mode === 'existing') editMessageDraft(entry, 'Existing draft');
    const transport = deferred<any>();
    let send: Promise<void> | undefined;
    if (mode === 'pending' || mode === 'failed') {
      editMessageDraft(entry, 'Original message');
      send = submitRecoveredMessage(
        entry,
        false,
        async () => (mode === 'pending' ? transport.promise : { status: 'failed' }),
        () => 'original-id',
      );
      if (mode === 'failed') await send;
      editMessageDraft(entry, 'Newer draft');
    }
    const attempt = entry.state.attempt;
    const draft = entry.state.draft;
    const share = await prepareChatShare(resource, 'channel', 'chapter', 'user', () => true);
    const ui = render(<Harness shareId={share.id} />);
    fireEvent.press(ui.getByText(draft ? 'Append to current draft' : 'Add to draft'));
    await waitFor(() =>
      expect(entry.state.draft).toBe(`${draft ? draft + '\n\n' : ''}${share.text}`),
    );
    expect(entry.state.attempt).toBe(attempt);
    ui.unmount();
    render(<Harness shareId={share.id} />);
    expect(getChatShare(entry, share.id)).toBeNull();
    expect(await appendChatShare(share, () => true)).toBe(false);
    if (send && mode === 'pending') {
      await act(async () => {
        transport.resolve({ status: 'failed' });
        await send;
      });
    }
  },
);
it('cancel preserves the current draft and cannot insert after a delayed access check', async () => {
  const entry = getMessageRecovery('channel', 'channel', 'user')!;
  editMessageDraft(entry, 'Keep me');
  const share = await prepareChatShare(resource, 'channel', 'chapter', 'user', () => true);
  const late = deferred<Result>();
  db.setIntercept((c) => (c.table === 'events' ? late.promise : undefined));
  const ui = render(<Harness shareId={share.id} />);
  fireEvent.press(ui.getByText('Append to current draft'));
  fireEvent.press(ui.getByText('Cancel share'));
  await act(async () => late.resolve({ data: db.rows.events[0], error: null }));
  expect(entry.state.draft).toBe('Keep me');
  expect(share.state).toBe('cancelled');
});
it('appends to newer typing after access validation, never an earlier draft snapshot', async () => {
  const entry = getMessageRecovery('channel', 'channel', 'user')!;
  editMessageDraft(entry, 'Old');
  const share = await prepareChatShare(resource, 'channel', 'chapter', 'user', () => true);
  const late = deferred<Result>();
  db.setIntercept((c) => (c.table === 'events' ? late.promise : undefined));
  const pending = appendChatShare(share, () => true);
  editMessageDraft(entry, 'New typing');
  late.resolve({ data: db.rows.events[0], error: null });
  await pending;
  expect(entry.state.draft).toBe(`New typing\n\n${share.text}`);
});
it.each(['logout', 'account', 'chapter', 'access', 'unmount'] as const)(
  'late sharing cannot affect %s',
  async (transition) => {
    const entry = getMessageRecovery('channel', 'channel', 'user')!;
    const share = await prepareChatShare(resource, 'channel', 'chapter', 'user', () => true);
    const late = deferred<Result>();
    db.setIntercept((c) => (c.table === 'events' ? late.promise : undefined));
    let current = true;
    const pending = appendChatShare(share, () => current);
    if (transition === 'logout') setMessageRecoveryAccount(null);
    if (transition === 'account') setMessageRecoveryAccount('other');
    if (transition === 'chapter') confirmMessageRecoveryMembership('user', 'other');
    if (transition === 'access') discardConversationRecovery(entry);
    if (transition === 'unmount') current = false;
    late.resolve({ data: db.rows.events[0], error: null });
    await expect(pending).rejects.toThrow();
    expect(entry.state.draft).toBe('');
  },
);
it('filters admin-readable but inaccessible channels and excludes cross-chapter destinations', async () => {
  db.rows.channels.push(
    { id: 'private', name: 'private', chapter_id: 'chapter' },
    { id: 'other', name: 'other', chapter_id: 'elsewhere' },
  );
  (jest.mocked(supabase.rpc) as any).mockImplementation(async (_: string, args: any) => ({
    data: args.p_channel_id !== 'private',
    error: null,
  }));
  expect((await listShareChannels('chapter')).channels.map((c) => c.id)).toEqual(['channel']);
  await expect(
    prepareChatShare(resource, 'private', 'chapter', 'user', () => true),
  ).rejects.toThrow();
  await expect(
    prepareChatShare(resource, 'other', 'chapter', 'user', () => true),
  ).rejects.toThrow();
});
it('revalidates removed sources and revoked destinations before appending', async () => {
  const entry = getMessageRecovery('channel', 'channel', 'user')!;
  const share = await prepareChatShare(resource, 'channel', 'chapter', 'user', () => true);
  db.rows.events = [];
  const ui = render(<Harness shareId={share.id} />);
  fireEvent.press(ui.getByText('Add to draft'));
  await ui.findByText('Couldn’t verify this item and channel. Retry or cancel.');
  expect(entry.state.draft).toBe('');
  cancelChatShare(share);
});
it.each([
  '/events/nope',
  '/events/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa?x=1',
  '/jobs/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/extra',
  'https://evil.test/events/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '/EVENTS/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '/events/%61aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
])('leaves malformed/unrecognized links as text: %s', (text) => {
  expect(parseDetailLink(text)).toBeNull();
  const ui = render(<ChannelMessageText content={text} />);
  expect(ui.queryByRole('link')).toBeNull();
  expect(ui.getByText(text)).toBeTruthy();
});
it('renders recognized links as accessible internal navigation', () => {
  const ui = render(<ChannelMessageText content={`Dinner\n/events/${resource.id}`} />);
  fireEvent.press(ui.getByLabelText('Open event'));
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/events/[id]', params: { id: resource.id } });
});
it.each(['web', 'ios', 'android'] as const)(
  'event detail has actionable %s deletion, immediate duplicate guard, and Interested wording',
  async (platform) => {
    const original = Platform.OS;
    Object.defineProperty(Platform, 'OS', { configurable: true, value: platform });
    const ui = render(<EventDetail />);
    await ui.findByText('Interested');
    fireEvent.press(ui.getByText('Delete event'));
    fireEvent.press(ui.getByText('Cancel deletion'));
    expect(db.calls.some((c) => c.steps.some((s) => s[0] === 'delete'))).toBe(false);
    fireEvent.press(ui.getByText('Delete event'));
    const late = deferred<Result>();
    let deletes = 0;
    db.setIntercept((c) => {
      if (c.steps.some((s) => s[0] === 'delete')) {
        deletes++;
        return late.promise;
      }
    });
    const confirm = ui.getByText('Permanently delete event');
    fireEvent.press(confirm);
    fireEvent.press(confirm);
    await waitFor(() => expect(deletes).toBe(1));
    await act(async () => late.resolve({ data: { id: resource.id }, error: null }));
    expect(back).toHaveBeenCalledTimes(1);
    Object.defineProperty(Platform, 'OS', { configurable: true, value: original });
  },
);
it('job detail presents closed/no-link/failed-open states and inline delete confirmation', async () => {
  db.rows.job_postings = [
    {
      id: resource.id,
      title: 'Engineer',
      company: 'Example',
      chapter_id: 'chapter',
      posted_by: 'user',
      is_open: false,
      apply_url: 'https://example.com',
      created_at: new Date().toISOString(),
    },
  ];
  const ui = render(<JobDetail />);
  await ui.findByText('This posting is closed.');
  expect(ui.queryByText('Apply')).toBeNull();
  fireEvent.press(ui.getByText('Delete posting'));
  expect(ui.getByText('Permanently delete posting')).toBeTruthy();
});
