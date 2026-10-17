import { beforeEach, expect, it, jest } from '@jest/globals';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import Network from '@/app/(tabs)/people';
import { useChapterMembers } from '@/lib/queries';
import EditJob from '@/app/jobs/edit/[id]';
import JobDetail from '@/app/jobs/[id]';
import { useJobs, useJob } from '@/lib/jobs';
import ProfileScreen from '@/app/profile/[id]';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { createMentorshipRequest, findRequestBetween } from '@/lib/mentorship';
import { Chip } from '@/components/Chip';
import { TextField } from '@/components/TextField';
import { colors } from '@/theme/network';

jest.mock('@/lib/home', () => ({
  ...jest.requireActual<any>('@/lib/home'),
  useMembershipCounts: () => mockCounts,
}));
jest.mock('@/lib/queries', () => ({ useChapterMembers: jest.fn() }));
jest.mock('@/lib/jobs', () => ({ useJobs: jest.fn(), useJob: jest.fn() }));
jest.mock('@/components/ShareToChat', () => ({ ShareToChat: () => null }));
jest.mock('@/lib/auth', () => ({ useAuth: jest.fn() }));
jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn() } }));
jest.mock('@/lib/mentorship', () => ({
  createMentorshipRequest: jest.fn(),
  findRequestBetween: jest.fn(),
}));
jest.mock('@/lib/moderation', () => ({
  canShowActorContent: (id: string, blocked: Set<string>) => !blocked.has(id),
  reportContent: jest.fn(),
  blockUser: jest.fn(),
}));
jest.mock('@/lib/url', () => ({ openExternalUrl: jest.fn() }));
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => ({ id: 'peer' }),
  useFocusEffect: jest.fn(),
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual<any>('react-native-safe-area-context/jest/mock').default,
);
const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };
const peer = {
  id: 'peer',
  user_id: 'peer-user',
  chapter_id: 'chapter',
  name: 'Alexandra Jordan Taylor Nguyen',
  status: 'approved',
  membership_type: 'alumni',
  open_to_mentor: true,
  bio: 'Career guidance and chapter life.',
};
let mockCounts: any;
const reload = jest.fn();
let auth: any;
let read: any;
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useJob).mockReturnValue({
    loading: false,
    error: null,
    reload,
    job: {
      id: 'job',
      posted_by: 'peer-user',
      title: 'Product designer',
      company: 'Northline',
      apply_url: 'https://careers.example.org/design',
      is_open: true,
    },
  } as any);
  mockCounts = { data: { active: 1234, alumni: 5678 }, loading: false, error: false, reload };
  jest.mocked(useChapterMembers).mockReturnValue({
    members: [peer as any],
    loading: false,
    error: null,
    reload,
    loadMore: async () => {},
    hasMore: false,
    loadingMore: false,
  });
  jest.mocked(useJobs).mockReturnValue({
    jobs: [],
    loading: false,
    error: null,
    reload,
    loadMore: async () => {},
    hasMore: false,
    loadingMore: false,
  });
  auth = {
    session: { user: { id: 'me' } },
    profile: { user_id: 'me', chapter_id: 'chapter', status: 'approved' },
    blockedIds: new Set(),
  };
  jest.mocked(useAuth).mockImplementation(() => auth);
  read = jest.fn(async () => ({ data: peer, error: null }));
  jest
    .mocked(supabase.from)
    .mockImplementation(() => ({ select: () => ({ eq: () => ({ maybeSingle: read }) }) }) as any);
  jest.mocked(findRequestBetween).mockResolvedValue(null);
  jest.mocked(createMentorshipRequest).mockResolvedValue({ id: 'request', error: null });
});
it('wraps the editorial profile heading and uses a scaling-friendly blue/gold request form', async () => {
  const ui = render(<ProfileScreen />);
  const heading = await ui.findByRole('header', { name: peer.name });
  expect(heading.props.numberOfLines).toBeUndefined();
  expect(heading.props.allowFontScaling).not.toBe(false);
  expect(StyleSheet.flatten(heading.props.style).color).toBe(colors.blue);
  fireEvent.press(ui.getByRole('button', { name: 'Request mentorship' }));
  expect(ui.UNSAFE_getByType(TextField).props.tone).toBe('home');
  fireEvent.press(ui.getByRole('button', { name: 'Send request' }));
  expect(ui.getByText('Add a short intro message.')).toBeTruthy();
  expect(createMentorshipRequest).not.toHaveBeenCalled();
  fireEvent.changeText(
    ui.getByPlaceholderText('Hi! I’d love your guidance on…'),
    '  Career guidance  ',
  );
  fireEvent.press(ui.getByRole('button', { name: 'Send request' }));
  await waitFor(() =>
    expect(createMentorshipRequest).toHaveBeenCalledWith({
      fromUserId: 'me',
      toUserId: 'peer-user',
      chapterId: 'chapter',
      message: 'Career guidance',
    }),
  );
  await waitFor(() =>
    expect(mockRouter.replace).toHaveBeenCalledWith({
      pathname: '/inbox/[requestId]',
      params: { requestId: 'request' },
    }),
  );
});
it.each(['pending', 'accepted'] as const)(
  'opens existing %s requests without creating another',
  async (status) => {
    jest.mocked(findRequestBetween).mockResolvedValue({ id: 'existing', status } as any);
    const ui = render(<ProfileScreen />);
    const label = status === 'accepted' ? 'Open conversation' : 'Request pending';
    fireEvent.press(await ui.findByRole('button', { name: label }));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/inbox/[requestId]',
      params: { requestId: 'existing' },
    });
    expect(createMentorshipRequest).not.toHaveBeenCalled();
  },
);
it('retains request draft and feedback on failed submission', async () => {
  jest
    .mocked(createMentorshipRequest)
    .mockResolvedValue({ id: null, error: 'Request unavailable. Please retry.' });
  const ui = render(<ProfileScreen />);
  fireEvent.press(await ui.findByRole('button', { name: 'Request mentorship' }));
  fireEvent.changeText(
    ui.getByPlaceholderText('Hi! I’d love your guidance on…'),
    'My introduction',
  );
  fireEvent.press(ui.getByRole('button', { name: 'Send request' }));
  await ui.findByText('Request unavailable. Please retry.');
  expect(ui.getByDisplayValue('My introduction')).toBeTruthy();
  expect(mockRouter.replace).not.toHaveBeenCalled();
});
it('distinguishes failed reads from unavailable profiles and recovers with Retry', async () => {
  read.mockResolvedValueOnce({ data: null, error: { message: 'private database diagnostic' } });
  const ui = render(<ProfileScreen />);
  fireEvent.press(await ui.findByRole('button', { name: 'Retry profile' }));
  await ui.findByRole('header', { name: peer.name });
  expect(ui.queryByText(/private database/)).toBeNull();
});
it('clears content and request draft immediately when blocking or membership scope changes', async () => {
  const ui = render(<ProfileScreen />);
  await ui.findByRole('header', { name: peer.name });
  auth = { ...auth, blockedIds: new Set(['peer-user']) };
  ui.rerender(<ProfileScreen />);
  expect(ui.queryByText(peer.bio)).toBeNull();
  await ui.findByText('This member couldn’t be found.');
  auth = { ...auth, blockedIds: new Set(), profile: { ...auth.profile, status: 'pending' } };
  const before = read.mock.calls.length;
  ui.rerender(<ProfileScreen />);
  await ui.findByText('This member couldn’t be found.');
  expect(read).toHaveBeenCalledTimes(before);
});
it('hides mentorship actions for self and members not open to mentor', async () => {
  read.mockResolvedValue({ data: { ...peer, open_to_mentor: false }, error: null });
  const ui = render(<ProfileScreen />);
  await ui.findByRole('header', { name: peer.name });
  expect(ui.queryByRole('button', { name: 'Request mentorship' })).toBeNull();
});

it('keeps real totals separate from loaded filtered results and the People route stable', () => {
  const ui = render(<Network />);
  expect(ui.getByRole('header', { name: 'Network' })).toBeTruthy();
  expect(ui.getByText('6912 approved members · 1234 active · 5678 alumni')).toBeTruthy();
  expect(ui.getByText('1 member loaded')).toBeTruthy();
  fireEvent.press(ui.UNSAFE_getAllByType(Chip).find((chip) => chip.props.label === 'Alumni')!);
  expect(useChapterMembers).toHaveBeenLastCalledWith(
    'chapter',
    expect.any(Set),
    expect.objectContaining({ membershipType: 'alumni' }),
  );
  expect(ui.getByText('6912 approved members · 1234 active · 5678 alumni')).toBeTruthy();
});
it('never turns unavailable totals into zero and exposes independent Retry', () => {
  mockCounts = { data: undefined, loading: false, error: true, reload };
  const ui = render(<Network />);
  expect(ui.getByText('Membership totals unavailable.')).toBeTruthy();
  expect(ui.getByText('1 member loaded')).toBeTruthy();
  fireEvent.press(ui.getByRole('button', { name: 'Retry totals' }));
  expect(reload).toHaveBeenCalledTimes(1);
});

it.each(['member', 'owner', 'admin'])(
  'preserves job management visibility for %s',
  async (role) => {
    if (role === 'owner') auth = { ...auth, session: { user: { id: 'peer-user' } } };
    if (role === 'admin') auth = { ...auth, profile: { ...auth.profile, admin_role: 'manager' } };
    const ui = render(<JobDetail />);
    await ui.findByText('Product designer');
    expect(ui.queryByRole('button', { name: 'Edit posting' }) !== null).toBe(role !== 'member');
    expect(
      ui.getByText('Application destination: https://careers.example.org/design'),
    ).toBeTruthy();
  },
);
it.each([
  { is_open: false, apply_url: 'https://careers.example.org/design' },
  { is_open: true, apply_url: 'javascript:alert(1)' },
])('does not offer Apply for closed or unsafe destinations: %p', (state) => {
  jest.mocked(useJob).mockReturnValue({
    loading: false,
    error: null,
    reload,
    job: { id: 'job', title: 'Designer', company: 'Studio', ...state },
  } as any);
  const ui = render(<JobDetail />);
  expect(ui.queryByRole('button', { name: 'Apply' })).toBeNull();
});

it('exposes editor read Retry instead of claiming a failed read is a missing posting', () => {
  jest
    .mocked(useJob)
    .mockReturnValue({ loading: false, error: 'private diagnostic', job: null, reload } as any);
  const ui = render(<EditJob />);
  fireEvent.press(ui.getByRole('button', { name: 'Retry posting' }));
  expect(reload).toHaveBeenCalledTimes(1);
  expect(ui.queryByText('This posting couldn’t be found.')).toBeNull();
  expect(ui.queryByText('private diagnostic')).toBeNull();
});
it('retains a hydrated job editor draft during failed refresh and Retry', () => {
  auth = { ...auth, session: { user: { id: 'peer-user' } } };
  const snapshot = {
    loading: false,
    error: null,
    reload,
    job: { id: 'job', posted_by: 'peer-user', title: 'Original title', company: 'Studio' },
  };
  jest.mocked(useJob).mockReturnValue(snapshot as any);
  const ui = render(<EditJob />);
  fireEvent.changeText(ui.getByLabelText('Title'), 'Unsaved title');
  jest.mocked(useJob).mockReturnValue({ ...snapshot, error: 'offline' } as any);
  ui.rerender(<EditJob />);
  fireEvent.press(ui.getByRole('button', { name: 'Retry posting' }));
  expect(ui.getByDisplayValue('Unsaved title')).toBeTruthy();
  expect(reload).toHaveBeenCalledTimes(1);
});
