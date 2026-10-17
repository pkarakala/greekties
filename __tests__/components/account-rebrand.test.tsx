import { beforeEach, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render } from '@testing-library/react-native';
import { useAuth } from '@/lib/auth';
import { usePendingMembers, useAdminChannels, useChapterMemberList, useChapter } from '@/lib/admin';
import { useChapterReports, useBlockedProfiles } from '@/lib/moderation';
import { supabase } from '@/lib/supabase';
import Me from '@/app/(tabs)/me';
import EditProfile from '@/app/profile/edit';
import Complete from '@/app/onboarding/complete-profile';
import Login from '@/app/login';
import Signup from '@/app/signup';
import Forgot from '@/app/forgot-password';
import Reset from '@/app/reset-password';
import Admin from '@/app/(tabs)/admin';
import Approvals from '@/app/admin/approvals';
import Members from '@/app/admin/members';
import Channels from '@/app/admin/channels';
import Reports from '@/app/admin/reports';
import ChapterSettings from '@/app/admin/settings';
import Blocked from '@/app/settings/blocked';
import { saveProfileWithMap } from '@/lib/profile';
import { TextField } from '@/components/TextField';

jest.mock('@/lib/auth', () => ({ useAuth: jest.fn() }));
jest.mock('@/lib/supabase', () => ({
  supabase: {
    functions: { invoke: jest.fn() },
    auth: {
      signInWithPassword: jest.fn(),
      signUp: jest.fn(),
      resetPasswordForEmail: jest.fn(),
      updateUser: jest.fn(),
    },
  },
}));
jest.mock('@/lib/home', () => ({
  ...jest.requireActual<any>('@/lib/home'),
  useChapterIdentity: () => ({
    data: { name: 'Chapter', university: 'University' },
    loading: false,
    error: false,
    reload: jest.fn(),
  }),
}));
jest.mock('@/lib/admin', () => ({
  usePendingMembers: jest.fn(),
  useAdminChannels: jest.fn(),
  useChapterMemberList: jest.fn(),
  useChapter: jest.fn(),
  approveMember: jest.fn(),
  rejectMember: jest.fn(),
}));
jest.mock('@/lib/moderation', () => ({
  useChapterReports: jest.fn(),
  useBlockedProfiles: jest.fn(),
  unblockUser: jest.fn(),
}));
jest.mock('@/lib/profile', () => ({ saveProfileWithMap: jest.fn(), uploadAvatar: jest.fn() }));
jest.mock('@/lib/chapters', () => ({
  fetchChapterInvite: async () => ({ code: null, error: 'Unavailable' }),
}));
jest.mock('@/lib/invite', () => ({
  readPendingInvite: async () => ({ invite: null, warning: null }),
  storePendingInviteCode: async () => ({ invite: null, warning: null }),
}));
jest.mock('@/lib/qa-build', () => ({
  isOwnerQaBuild: true,
  ownerQaDeletionNotice: 'Deletion is unavailable in isolated QA.',
}));
jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: async () => ({ granted: false }),
}));
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => ({}),
  useFocusEffect: jest.fn(),
  Link: ({ children }: any) => {
    // Exercise Expo Router's actual style merging; a passthrough misses Slot crashes.
    const { Slot } = jest.requireActual<any>('expo-router/build/ui/Slot');
    return <Slot>{children}</Slot>;
  },
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual<any>('react-native-safe-area-context/jest/mock').default,
);
const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => false };
const reload = jest.fn();
let auth: any;
beforeEach(() => {
  jest.clearAllMocks();
  auth = {
    session: { user: { id: 'self' } },
    profile: {
      id: 'profile',
      user_id: 'self',
      chapter_id: 'chapter',
      status: 'approved',
      admin_role: 'owner',
      membership_type: 'alumni',
      name: 'Alexandra Jordan Taylor Nguyen',
      map_revision: 'revision',
      map_sharing_enabled: false,
    },
    blockedIds: new Set(),
    refreshProfile: jest.fn(async () => {}),
    signOut: jest.fn(async () => {}),
    initializing: false,
    authError: null,
  };
  jest.mocked(useAuth).mockImplementation(() => auth);
  jest
    .mocked(usePendingMembers)
    .mockReturnValue({ members: [], loading: false, error: null, reload });
  jest
    .mocked(useAdminChannels)
    .mockReturnValue({ channels: [], loading: false, error: null, reload });
  jest
    .mocked(useChapterMemberList)
    .mockReturnValue({ members: [], loading: false, error: null, reload });
  jest
    .mocked(useChapterReports)
    .mockReturnValue({ reports: [], loading: false, error: null, reload });
  jest
    .mocked(useBlockedProfiles)
    .mockReturnValue({ blocked: [], loading: false, error: null, reload });
  jest.mocked(useChapter).mockReturnValue({ chapter: null, loading: false, reload });
  jest.mocked(saveProfileWithMap).mockResolvedValue({ error: null, revision: 'revision' } as any);
  jest.mocked(supabase.auth.signInWithPassword).mockResolvedValue({ error: null } as any);
  jest
    .mocked(supabase.auth.signUp)
    .mockResolvedValue({ data: { session: null }, error: null } as any);
  jest.mocked(supabase.auth.resetPasswordForEmail).mockResolvedValue({ error: null } as any);
});
it.each([Admin, Approvals, Members, Channels, Reports, ChapterSettings])(
  'gates %p before any admin read for ordinary members',
  (Component) => {
    auth.profile.admin_role = null;
    const ui = render(<Component />);
    expect(ui.getByText('Chapter admin access required.')).toBeTruthy();
    for (const hook of [
      usePendingMembers,
      useAdminChannels,
      useChapterMemberList,
      useChapterReports,
      useChapter,
    ])
      expect(hook).not.toHaveBeenCalled();
  },
);
it.each(['pending', 'rejected'])('does not render management for a %s owner profile', (status) => {
  auth.profile.status = status;
  const ui = render(<Channels />);
  expect(ui.queryByText('Create channel')).toBeNull();
  expect(useAdminChannels).not.toHaveBeenCalled();
});
it('clears management content immediately after role revocation', () => {
  const ui = render(<Channels />);
  expect(ui.getByText('Create channel')).toBeTruthy();
  auth = { ...auth, profile: { ...auth.profile, admin_role: null } };
  ui.rerender(<Channels />);
  expect(ui.queryByText('Create channel')).toBeNull();
});
it('keeps QA deletion unavailable before any destructive call', () => {
  const ui = render(<Me />);
  expect(
    ui.getByRole('button', { name: 'Account deletion unavailable', disabled: true }),
  ).toBeTruthy();
  expect(ui.queryByRole('button', { name: 'Permanently delete account' })).toBeNull();
  expect(supabase.functions.invoke).not.toHaveBeenCalled();
});
it.each([EditProfile, Complete])(
  'keeps missing/legacy map consent off and unavailable in %p',
  (Component) => {
    auth.profile.map_sharing_enabled = undefined;
    auth.profile.map_revision = undefined;
    const ui = render(<Component />);
    const control = ui.getByLabelText('Share my city on the alumni map');
    expect(control.props.value).toBe(false);
    expect(control.props.disabled).toBe(true);
    const field = ui
      .UNSAFE_getAllByType(TextField)
      .find((f) => f.props.label === 'City (optional)')!;
    fireEvent.changeText(field, 'Austin');
    expect(ui.getByLabelText('Share my city on the alumni map').props.value).toBe(false);
  },
);
it('passes explicit map opt-in and captured revision unchanged to the existing save contract', async () => {
  const ui = render(<EditProfile />);
  fireEvent(ui.getByLabelText('Share my city on the alumni map'), 'valueChange', true);
  await act(async () => fireEvent.press(ui.getByRole('button', { name: 'Save' })));
  expect(saveProfileWithMap).toHaveBeenCalledWith(
    expect.objectContaining({ map_revision: 'revision' }),
    expect.any(Object),
    '',
    true,
    expect.any(Function),
  );
});
it('keeps auth inputs secure and uses the existing sign-in payload', async () => {
  const ui = render(<Login />);
  expect(ui.getByLabelText('Password').props.secureTextEntry).toBe(true);
  fireEvent.changeText(ui.getByLabelText('Email'), 'local@example.test');
  fireEvent.changeText(ui.getByLabelText('Password'), 'synthetic-password');
  await act(async () => fireEvent.press(ui.getByRole('button', { name: 'Log in' })));
  expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
    email: 'local@example.test',
    password: 'synthetic-password',
  });
});
it('shows confirmation guidance without inventing approved membership after sign-up', async () => {
  const ui = render(<Signup />);
  fireEvent.changeText(ui.getByLabelText('Full name'), 'Synthetic Member');
  fireEvent.changeText(ui.getByLabelText('Email'), 'local@example.test');
  fireEvent.changeText(ui.getByLabelText('Password'), 'synthetic-password');
  await act(async () => fireEvent.press(ui.getByRole('button', { name: 'Sign up' })));
  expect(ui.getByText(/Check your email to confirm/)).toBeTruthy();
  expect(mockRouter.replace).not.toHaveBeenCalled();
});
it('preserves recovery callback without outbound email', async () => {
  const ui = render(<Forgot />);
  fireEvent.changeText(ui.getByLabelText('Email'), 'local@example.test');
  await act(async () => fireEvent.press(ui.getByRole('button', { name: 'Send reset link' })));
  expect(supabase.auth.resetPasswordForEmail).toHaveBeenCalledWith('local@example.test', {
    redirectTo: 'greekties://reset-password',
  });
  expect(ui.getByText('Check your email for a reset link.')).toBeTruthy();
});
it('keeps password updates disabled for an expired or missing recovery session', () => {
  auth.session = null;
  const ui = render(<Reset />);
  expect(ui.getByRole('button', { name: 'Update password', disabled: true })).toBeTruthy();
  expect(supabase.auth.updateUser).not.toHaveBeenCalled();
});
it.each([
  { Component: Blocked, hook: useBlockedProfiles, key: 'blocked', label: 'blocked members' },
  { Component: Approvals, hook: usePendingMembers, key: 'members', label: 'member approvals' },
  { Component: Channels, hook: useAdminChannels, key: 'channels', label: 'channels' },
  { Component: Reports, hook: useChapterReports, key: 'reports', label: 'reports' },
])(
  'provides read Retry for $label without private diagnostics',
  ({ Component, hook, key, label }) => {
    (hook as any).mockReturnValue({
      [key]: [],
      loading: false,
      error: 'private SQL diagnostic',
      reload,
    });
    const ui = render(<Component />);
    fireEvent.press(ui.getByRole('button', { name: `Retry ${label}` }));
    expect(reload).toHaveBeenCalledTimes(1);
    expect(ui.queryByText(/private SQL/)).toBeNull();
  },
);
it('exposes chapter settings Retry without rendering an unsourced form', () => {
  const ui = render(<ChapterSettings />);
  fireEvent.press(ui.getByRole('button', { name: 'Retry chapter settings' }));
  expect(reload).toHaveBeenCalledTimes(1);
  expect(ui.queryByLabelText('Chapter name')).toBeNull();
});
