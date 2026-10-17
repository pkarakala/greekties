import { beforeEach, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render } from '@testing-library/react-native';
import { Linking, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import Me from '@/app/(tabs)/me';
import { deferred, homeDb } from '../helpers/home-db';

jest.mock('@/lib/auth', () => ({ useAuth: jest.fn() }));
jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn(), rpc: jest.fn() } }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
  useFocusEffect: jest.fn(),
}));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: jest.fn(),
}));
jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual<any>('react-native-safe-area-context/jest/mock').default,
);
const mockPush = jest.fn();
let auth: any;
let db: ReturnType<typeof homeDb>;
beforeEach(() => {
  jest.clearAllMocks();
  jest
    .mocked(useWindowDimensions)
    .mockReturnValue({ width: 375, height: 812, scale: 1, fontScale: 1 });
  db = homeDb();
  jest.mocked(supabase.from).mockImplementation(db.from);
  auth = {
    session: { user: { id: 'user-a' } },
    profile: {
      id: 'profile-a',
      user_id: 'user-a',
      chapter_id: 'chapter-a',
      status: 'approved',
      membership_type: 'alumni',
      name: 'Jordan Taylor',
      class_year: 2022,
      admin_role: null,
      job_title: 'Product designer',
      role: 'Legacy role',
      company: 'Northline',
      industry: 'Technology',
      city: 'San Francisco, CA',
      bio: 'Tools for small businesses.',
      linkedin_url: 'linkedin.com/in/jordan',
      open_to_mentor: true,
      is_hiring: true,
      map_sharing_enabled: false,
    },
    signOut: jest.fn(async () => {}),
  };
  jest.mocked(useAuth).mockImplementation(() => auth);
});

it('keeps explicit status and full professional identity, with edit and map management using the existing editor', async () => {
  const ui = render(<Me />);
  await ui.findByText('Sigma Phi Epsilon · California Gamma · UCSB');
  expect(ui.getByText('Approved chapter member')).toBeTruthy();
  expect(ui.getByText('Alumni · Class of 2022')).toBeTruthy();
  expect(ui.getByText('Product designer · Northline')).toBeTruthy();
  expect(ui.queryByText(/Legacy role/)).toBeNull();
  expect(ui.getByText('Technology · San Francisco, CA')).toBeTruthy();
  expect(ui.getByText('About')).toBeTruthy();
  expect(ui.getByText('Hiring')).toBeTruthy();
  expect(ui.getByText('Open to mentorship')).toBeTruthy();
  expect(ui.queryByText(/profile details complete/)).toBeNull();
  fireEvent.press(ui.getByRole('button', { name: 'Edit profile' }));
  fireEvent.press(ui.getByRole('button', { name: 'Manage map sharing' }));
  expect(mockPush.mock.calls).toEqual([['/profile/edit'], ['/profile/edit']]);
  expect(supabase.rpc).not.toHaveBeenCalled();
});

it('renders an honest sparse profile without an empty About section or inferred signals', async () => {
  auth.profile = {
    ...auth.profile,
    name: '  ',
    job_title: null,
    role: 'Student',
    company: null,
    industry: null,
    city: null,
    bio: ' ',
    linkedin_url: ' ',
    open_to_mentor: false,
    is_hiring: false,
    membership_type: 'active',
    class_year: null,
  };
  const ui = render(<Me />);
  await ui.findByText('Member');
  expect(ui.getByText('Active member')).toBeTruthy();
  expect(ui.getByText('Student')).toBeTruthy();
  expect(ui.getByText(/1 of 5 profile details complete/)).toBeTruthy();
  for (const label of ['About', 'Hiring', 'Open to mentorship', 'View LinkedIn profile'])
    expect(ui.queryByText(label)).toBeNull();
  expect(ui.getByText('Account')).toBeTruthy();
});

it.each([
  [
    undefined,
    'alumni',
    null,
    null,
    'Off',
    'Map sharing is off. Your optional profile city is separate.',
  ],
  [
    true,
    'active',
    37,
    -122,
    'On',
    'Map sharing is enabled. A pin appears only for approved alumni with a saved map location.',
  ],
  [
    true,
    'alumni',
    null,
    null,
    'On',
    'Map sharing is enabled. A pin appears only for approved alumni with a saved map location.',
  ],
  [true, 'alumni', 37, -122, 'On', 'Your approximate city is shared on the alumni map.'],
] as [boolean | undefined, string, number | null, number | null, string, string][])(
  'distinguishes consent %s / %s from actual map eligibility',
  async (consent, membership, lat, lng, label, note) => {
    auth.profile = {
      ...auth.profile,
      map_sharing_enabled: consent,
      membership_type: membership,
      lat,
      lng,
    };
    const ui = render(<Me />);
    await ui.findByText(label);
    expect(ui.getByText(note)).toBeTruthy();
    expect(ui.getByText('Your profile city is visible in your chapter.')).toBeTruthy();
    expect(ui.queryByRole('switch')).toBeNull();
  },
);

it('retains identity during loading and failure, and retries without hiding account controls', async () => {
  const pending = deferred<any>();
  db.queued.chapters = [pending.promise];
  const ui = render(<Me />);
  expect(ui.getByText('Loading chapter identity…')).toBeTruthy();
  expect(ui.getByText('Jordan Taylor')).toBeTruthy();
  expect(ui.getByRole('button', { name: 'Sign out' })).toBeTruthy();
  await act(async () => pending.resolve({ data: null, error: { message: 'offline' } }));
  fireEvent.press(await ui.findByRole('button', { name: 'Retry chapter identity' }));
  await ui.findByText('Sigma Phi Epsilon · California Gamma · UCSB');
  expect(ui.queryByText('Couldn’t load chapter identity.')).toBeNull();
});

it('keeps the relocated LinkedIn action sanitized and rejects unsafe addresses', async () => {
  const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  try {
    const ui = render(<Me />);
    await ui.findByText('Jordan Taylor');
    fireEvent.press(ui.getByRole('link', { name: 'View LinkedIn profile' }));
    expect(open).toHaveBeenCalledWith('https://linkedin.com/in/jordan');
    auth.profile = { ...auth.profile, linkedin_url: 'javascript:alert(1)' };
    ui.rerender(<Me />);
    fireEvent.press(ui.getByRole('link', { name: 'View LinkedIn profile' }));
    expect(open).toHaveBeenCalledTimes(1);
    expect(ui.getByRole('alert')).toHaveTextContent(/This link is not a valid web address/);
  } finally {
    open.mockRestore();
  }
});

it('stacks identity at enlarged native font scale and keeps long names untruncated', async () => {
  jest
    .mocked(useWindowDimensions)
    .mockReturnValue({ width: 360, height: 812, scale: 1, fontScale: 1.6 });
  auth.profile.name = 'Alexandra Jordan Taylor Nguyen';
  const ui = render(<Me />);
  const name = await ui.findByText(auth.profile.name);
  expect(name.props.numberOfLines).toBeUndefined();
  const identity = ui.UNSAFE_getAllByType(View).find((node) => {
    const style = StyleSheet.flatten(node.props.style);
    return style?.flexDirection === 'column' && style?.gap === 16;
  });
  expect(identity).toBeTruthy();
});

it('removes identity and actions immediately when approval is revoked', async () => {
  const ui = render(<Me />);
  await ui.findByText('Jordan Taylor');
  auth.profile = { ...auth.profile, status: 'pending' };
  ui.rerender(<Me />);
  expect(ui.queryByText('Approved chapter member')).toBeNull();
  expect(ui.queryByText('Jordan Taylor')).toBeNull();
  expect(ui.queryByText('Edit profile')).toBeNull();
});
