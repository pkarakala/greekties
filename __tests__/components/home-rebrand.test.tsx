import { beforeEach, expect, it, jest } from '@jest/globals';
import { fireEvent, render } from '@testing-library/react-native';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import Home from '@/app/(tabs)/index';
import { homeDb } from '../helpers/home-db';

jest.mock('@/lib/auth', () => ({ useAuth: jest.fn() }));
jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn(), rpc: jest.fn() } }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
  useFocusEffect: jest.fn(),
}));
jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual<any>('react-native-safe-area-context/jest/mock').default,
);
const mockPush = jest.fn();
let db: ReturnType<typeof homeDb>;
beforeEach(() => {
  jest.clearAllMocks();
  db = homeDb();
  jest.mocked(supabase.rpc).mockResolvedValue({ data: true, error: null } as any);
  jest.mocked(supabase.from).mockImplementation(db.from);
  jest.mocked(useAuth).mockReturnValue({
    session: { user: { id: 'me' } },
    profile: {
      user_id: 'me',
      chapter_id: 'chapter-a',
      status: 'approved',
      membership_type: 'active',
      admin_role: null,
    },
    blockedIds: new Set(),
  } as any);
});
it('uses supported message content with an accessible full preview and the existing channel destination', async () => {
  const content =
    'A long chapter conversation preview with plans for Saturday and introductions for returning alumni.';
  db.rows.channel_messages = [
    {
      channel_id: 'general',
      content,
      created_at: '2026-10-15T12:00:00Z',
      sender_id: 'peer',
      channels: { name: 'Chapter chat', chapter_id: 'chapter-a' },
    },
  ];
  const ui = render(<Home />);
  expect(await ui.findByText(content)).toBeTruthy();
  const row = ui.getByRole('button', {
    name: new RegExp(`Open conversation: Chapter chat. ${content}`),
  });
  fireEvent.press(row);
  expect(mockPush).toHaveBeenCalledWith({
    pathname: '/chats/[channelId]',
    params: { channelId: 'general' },
  });
  expect(db.calls.find((c) => c.table === 'channel_messages')?.steps).toContainEqual([
    'select',
    'channel_id, content, created_at, channels!inner(name, chapter_id)',
  ]);
  expect(ui.queryByText(/unread|online/i)).toBeNull();
});
it('shows the real category without any event media or fabricated attendance', async () => {
  db.rows.events = [
    {
      id: 'event',
      chapter_id: 'chapter-a',
      title: 'Chapter dinner',
      category: 'alumni',
      starts_at: '2099-11-07T00:00:00Z',
      created_by: 'peer',
    },
  ];
  const ui = render(<Home />);
  expect(await ui.findByText('ALUMNI')).toBeTruthy();
  fireEvent.press(ui.getByText('Chapter dinner'));
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/events/[id]', params: { id: 'event' } });
  expect(ui.queryByText(/going|recommended|upload/i)).toBeNull();
});
it.each(['active', 'alumni'])(
  'does not expose chapter management to a normal %s member',
  async (membership_type) => {
    jest.mocked(useAuth).mockReturnValue({
      session: { user: { id: 'me' } },
      profile: {
        user_id: 'me',
        chapter_id: 'chapter-a',
        status: 'approved',
        membership_type,
        admin_role: null,
      },
      blockedIds: new Set(),
    } as any);
    const ui = render(<Home />);
    await ui.findByLabelText('Sigma Phi Epsilon · California Gamma · UCSB');
    expect(ui.queryByText('Chapter invitations')).toBeNull();
    expect(ui.getByText('Explore your network')).toBeTruthy();
  },
);

it.each([false, null])('hides message text when channel visibility is %s', async (visible) => {
  db.rows.channel_messages = [
    {
      channel_id: 'general',
      content: 'Restricted preview',
      created_at: '2026-10-15T12:00:00Z',
      sender_id: 'peer',
      channels: { name: 'Chapter chat', chapter_id: 'chapter-a' },
    },
  ];
  jest.mocked(supabase.rpc).mockResolvedValue({ data: visible, error: null } as any);
  const ui = render(<Home />);
  await ui.findByLabelText('Sigma Phi Epsilon · California Gamma · UCSB');
  await ui.findByText(
    visible === false ? 'Browse your chapter channels and join a conversation.' : '# Chapter chat',
  );
  expect(ui.queryByText('Restricted preview')).toBeNull();
});

it('separates the chapter heading and university into scalable wrapping text nodes', async () => {
  const ui = render(<Home />);
  await ui.findByLabelText('Sigma Phi Epsilon · California Gamma · UCSB');
  const heading = ui.getByText('Sigma Phi Epsilon · California Gamma');
  const university = ui.getByText('UCSB');
  expect(heading.parent).not.toBe(university);
  expect(heading.props.numberOfLines).toBeUndefined();
  expect(university.props.numberOfLines).toBeUndefined();
  expect(university.props.allowFontScaling).not.toBe(false);
});
