import { beforeEach, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import * as ReactNative from 'react-native';
import Chats from '@/app/(tabs)/chats/index';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useFocusEffect, useRouter } from 'expo-router';
import { chatsDb } from '../helpers/chats-db';
import { deferred } from '../helpers/message-db';
jest.mock('@/lib/auth', () => ({ useAuth: jest.fn() }));
jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn(), rpc: jest.fn() } }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('expo-router', () => ({ useRouter: jest.fn(), useFocusEffect: jest.fn() }));
jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual<any>('react-native-safe-area-context/jest/mock').default,
);
let db: ReturnType<typeof chatsDb>;
let auth: any;
const push = jest.fn();
beforeEach(() => {
  jest.clearAllMocks();
  db = chatsDb();
  (supabase.from as any).mockImplementation(db.from);
  (supabase.rpc as any).mockImplementation(db.rpc);
  auth = {
    session: { user: { id: 'me' } },
    profile: {
      user_id: 'me',
      chapter_id: 'chapter',
      status: 'approved',
      membership_type: 'active',
      admin_role: null,
    },
    blockedIds: new Set(),
  };
  (useAuth as any).mockImplementation(() => auth);
  (useRouter as any).mockReturnValue({ push });
  db.rows.channels = [{ id: 'g', name: 'General', chapter_id: 'chapter', description: null }];
  db.rows.mentorship_requests = [
    { id: 'm', status: 'accepted', chapter_id: 'chapter', from_user_id: 'me', to_user_id: 'peer' },
  ];
  db.rows.profiles = [{ user_id: 'peer', name: 'Synthetic Mentor', avatar_url: null }];
  db.rows.channel_messages = [
    {
      id: 'text',
      channel_id: 'g',
      sender_id: 'peer',
      content: 'Chapter weekend',
      created_at: '2026-10-11T12:00:00Z',
    },
  ];
});
it('opens both existing routes, preserves search/selection on focus, and keeps requests reachable', async () => {
  const ui = render(<Chats />);
  await ui.findByText('Synthetic Mentor');
  fireEvent.press(ui.getByRole('button', { name: /Synthetic Mentor, accepted mentorship/ }));
  expect(push).toHaveBeenLastCalledWith({
    pathname: '/inbox/[requestId]',
    params: { requestId: 'm' },
  });
  fireEvent.press(ui.getByRole('tab', { name: 'Groups' }));
  fireEvent.changeText(ui.getByLabelText('Search conversations'), 'weekend');
  fireEvent.press(ui.getByRole('button', { name: /General, group/ }));
  expect(push).toHaveBeenLastCalledWith({
    pathname: '/chats/[channelId]',
    params: { channelId: 'g' },
  });
  act(() => (jest.mocked(useFocusEffect).mock.calls.at(-1)![0] as () => void)());
  expect(ui.getByLabelText('Search conversations').props.value).toBe('weekend');
  expect(ui.getByRole('tab', { name: 'Groups' }).props.accessibilityState.selected).toBe(true);
  expect(ui.queryByText('Synthetic Mentor')).toBeNull();
  fireEvent.press(ui.getByRole('button', { name: 'Requests, review mentorship requests' }));
  expect(push).toHaveBeenLastCalledWith('/inbox');
  expect(ui.queryByText('Unread')).toBeNull();
  await waitFor(() => expect(ui.queryByText('Updating groups…')).toBeNull());
});
it('distinguishes empty search, empty inbox, loading and errors, with source-specific Retry', async () => {
  const held = deferred();
  db.queue.channels = [held.promise];
  db.queue.mentorship_requests = [Promise.reject(new Error('offline'))];
  const ui = render(<Chats />);
  expect(ui.getByText('Loading groups…')).toBeTruthy();
  expect(ui.queryByText('No conversations yet.')).toBeNull();
  fireEvent.press(await ui.findByText('Retry mentorship'));
  await ui.findByText('Synthetic Mentor');
  await act(async () => held.resolve({ data: [], error: null }));
  fireEvent.changeText(ui.getByLabelText('Search conversations'), 'no-match');
  expect(ui.getByText('No loaded conversations match your search.')).toBeTruthy();
  fireEvent.press(ui.getByLabelText('Clear search'));
  db.rows.mentorship_requests = [];
  db.rows.channels = [];
  act(() => (jest.mocked(useFocusEffect).mock.calls.at(-1)![0] as () => void)());
  await ui.findByText('No conversations yet.');
});
it('does not call a failed source empty or erase the valid other source', async () => {
  db.queue.channels = [Promise.reject(new Error('offline'))];
  const ui = render(<Chats />);
  await ui.findByText('Synthetic Mentor');
  await ui.findByText('Retry groups');
  expect(ui.queryByText('No conversations yet.')).toBeNull();
  fireEvent.press(ui.getByText('Retry groups'));
  await ui.findByText('General');
});
it('clears rows, search and selected filter on account/chapter changes and sign-out', async () => {
  const ui = render(<Chats />);
  await ui.findByText('General');
  fireEvent.changeText(ui.getByLabelText('Search conversations'), 'weekend');
  fireEvent.press(ui.getByText('Groups'));
  auth = {
    ...auth,
    session: { user: { id: 'other' } },
    profile: { ...auth.profile, user_id: 'other', chapter_id: 'elsewhere' },
  };
  ui.rerender(<Chats />);
  expect(ui.queryByText('General')).toBeNull();
  expect(ui.getByLabelText('Search conversations').props.value).toBe('');
  expect(ui.getByRole('tab', { name: 'All' }).props.accessibilityState.selected).toBe(true);
  await ui.findByText('No conversations yet.');
  auth = { ...auth, session: null, profile: null };
  ui.rerender(<Chats />);
  expect(ui.queryByLabelText('Search conversations')).toBeNull();
});
it('does not render or fetch for pending membership', () => {
  auth.profile.status = 'pending';
  const ui = render(<Chats />);
  expect(ui.queryByText('General')).toBeNull();
  expect(db.calls).toHaveLength(0);
});

it('lets names and previews expand at enlarged system font scale', async () => {
  const dimensions = jest
    .spyOn(ReactNative, 'useWindowDimensions')
    .mockReturnValue({ width: 360, height: 800, scale: 2, fontScale: 2 });
  try {
    const ui = render(<Chats />);
    await ui.findByText('General');
    expect(ui.getByText('General').props.numberOfLines).toBeUndefined();
    expect(ui.getByText('Chapter weekend').props.numberOfLines).toBeUndefined();
  } finally {
    dimensions.mockRestore();
  }
});
