import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Linking, Platform } from 'react-native';
import { useAuth } from '@/lib/auth';
import * as qaBuild from '@/lib/qa-build';
import { supabase } from '@/lib/supabase';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useChannels } from '@/lib/chat';
import { useChapterMembers } from '@/lib/queries';
import { useJobs } from '@/lib/jobs';
import Home from '@/app/(tabs)/index';
import Me from '@/app/(tabs)/me';
import Chats from '@/app/(tabs)/chats/index';
import People from '@/app/(tabs)/people';
import TabsLayout from '@/app/(tabs)/_layout';
import { deferred, homeDb, type Result } from '../helpers/home-db';

jest.mock('@/lib/qa-build', () => ({
  __esModule: true,
  isOwnerQaBuild: false,
  ownerQaDeletionNotice: 'Account deletion is unavailable in this owner-only QA build.',
}));
jest.mock('@/lib/auth', () => ({ useAuth: jest.fn() }));
jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: jest.fn(),
    rpc: jest.fn(),
    storage: { from: jest.fn() },
    functions: { invoke: jest.fn() },
  },
}));
jest.mock('@/lib/chat', () => ({ useChannels: jest.fn() }));
jest.mock('@/lib/queries', () => ({ useChapterMembers: jest.fn() }));
jest.mock('@/lib/jobs', () => ({ useJobs: jest.fn() }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('expo-router', () => {
  const React = jest.requireActual<any>('react');
  const { Text } = jest.requireActual<any>('react-native');
  const Tabs = ({ children }: any) => children;
  Tabs.Screen = function TabScreen({ options }: any) {
    return options.href === null ? null : React.createElement(Text, null, options.title);
  };
  return { useRouter: jest.fn(), useFocusEffect: jest.fn(), useLocalSearchParams: jest.fn(), Tabs };
});
jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual<any>('react-native-safe-area-context/jest/mock').default,
);
let db: ReturnType<typeof homeDb>;
let auth: any;
let params: any;
const push = jest.fn();
const setParams = jest.fn();
const router = { push, setParams };
const complete = {
  avatar_url: 'https://example.invalid/avatar',
  job_title: 'Engineer',
  role: 'Engineer',
  industry: 'Technology',
  bio: 'Building useful things.',
  linkedin_url: 'linkedin.com/in/test',
  company: 'Example Studio',
};
const event = {
  id: 'event',
  chapter_id: 'chapter-a',
  title: 'Alumni dinner',
  location: 'Santa Barbara',
  starts_at: '2099-10-10T20:00:00Z',
  ends_at: null,
  created_by: 'peer',
};
const job = {
  id: 'job',
  chapter_id: 'chapter-a',
  title: 'Product engineer',
  company: 'Example Studio',
  location: 'Remote',
  posted_by: 'peer',
  created_at: '2026-09-17',
  is_open: true,
};
beforeEach(() => {
  jest.clearAllMocks();
  db = homeDb();
  jest.mocked(supabase.from).mockImplementation(db.from);
  (jest.mocked(supabase.functions.invoke) as any).mockResolvedValue({
    data: { success: true },
    error: null,
  });
  jest
    .mocked(supabase.storage.from)
    .mockReturnValue({ remove: jest.fn(async () => ({ data: [], error: null })) } as any);
  auth = {
    session: { user: { id: 'user-a' } },
    profile: {
      id: 'profile-a',
      user_id: 'user-a',
      chapter_id: 'chapter-a',
      status: 'approved',
      membership_type: 'alumni',
      admin_role: null,
      name: 'Alex Morgan',
      city: 'Austin',
      class_year: 2018,
      map_sharing_enabled: false,
    },
    blockedIds: new Set(),
    signOut: jest.fn(async () => {}),
  };
  jest.mocked(useAuth).mockImplementation(() => auth);
  jest.mocked(useRouter).mockReturnValue(router as any);
  params = {};
  jest.mocked(useLocalSearchParams).mockImplementation(() => params);
  jest
    .mocked(useChannels)
    .mockReturnValue({ sections: [], loading: false, error: null, reload: jest.fn() });
  jest.mocked(useChapterMembers).mockReturnValue({
    members: [],
    loading: false,
    error: null,
    reload: jest.fn(),
    loadMore: jest.fn(async () => {}),
    hasMore: false,
    loadingMore: false,
  });
  jest.mocked(useJobs).mockReturnValue({
    jobs: [],
    loading: false,
    error: null,
    reload: jest.fn(),
    loadMore: jest.fn(async () => {}),
    hasMore: false,
    loadingMore: false,
  });
});

describe('Home with actual read hooks and synthetic query service', () => {
  it('shows full membership counts and opens the matching directory filter', async () => {
    db.rows.profiles = [
      {
        user_id: 'current',
        chapter_id: 'chapter-a',
        status: 'approved',
        membership_type: 'active',
        role: 'Alumni',
      },
      {
        user_id: 'alum',
        chapter_id: 'chapter-a',
        status: 'approved',
        membership_type: 'alumni',
        role: 'Student',
      },
    ];
    const ui = render(<Home />);
    expect(ui.getByText('Loading membership counts…')).toBeTruthy();
    for (const [label, membership] of [
      ['Current members', 'active'],
      ['Alumni', 'alumni'],
    ]) {
      fireEvent.press(await ui.findByRole('button', { name: `${label}, 1. Open directory` }));
      expect(push).toHaveBeenLastCalledWith({
        pathname: '/people',
        params: { view: 'directory', membership },
      });
    }
  });
  it('does not present a failed count as zero and recovers to a genuine empty count', async () => {
    db.queued.profiles = [Promise.resolve({ data: null, error: { message: 'offline' } })];
    const ui = render(<Home />);
    await ui.findByText('Retry membership counts');
    expect(ui.queryByRole('button', { name: 'Current members, 0. Open directory' })).toBeNull();
    expect(ui.queryByText('0')).toBeNull();
    fireEvent.press(ui.getByText('Retry membership counts'));
    await ui.findByRole('button', { name: 'Current members, 0. Open directory' });
  });
  it.each([
    ['chapter-a', 'Sigma Phi Epsilon · California Gamma · UCSB'],
    ['chapter-b', 'Pi Beta Phi · California Zeta · UCSB'],
  ])('keeps full chapter identity for %s', async (id, label) => {
    auth.profile.chapter_id = id;
    const ui = render(<Home />);
    expect(await ui.findByLabelText(label)).toBeTruthy();
  });
  it('shows distinct loading, true empty states, notifications, profile, network and optional map destinations', async () => {
    const ui = render(<Home />);
    expect(ui.getByText('Loading upcoming event…')).toBeTruthy();
    expect(ui.queryByText('No upcoming events scheduled.')).toBeNull();
    await ui.findByText('No upcoming events scheduled.');
    expect(ui.getByText('No open opportunities yet.')).toBeTruthy();
    for (const [label, path] of [
      ['Open notifications', '/notifications'],
      ['View or complete your profile', '/me'],
      ['Explore your network', '/network'],
      ['Alumni map · sharing is optional', '/map'],
      ['All chats', '/chats'],
      ['All events', '/events'],
    ]) {
      fireEvent.press(ui.getByRole('button', { name: label }));
      expect(push).toHaveBeenLastCalledWith(path);
    }
    expect(ui.queryByText('Chapter invitations')).toBeNull();
    expect(ui.queryByText('People you should know')).toBeNull();
  });
  it('selects an upcoming unblocked event, two newest open unblocked jobs and visible conversation activity', async () => {
    auth.blockedIds = new Set(['blocked']);
    db.rows.events = [
      { ...event, id: 'ended', title: 'Ended event', starts_at: '2001-01-01' },
      { ...event, id: 'invalid-ended', ends_at: '2001-01-01' },
      { ...event, id: 'blocked', created_by: 'blocked' },
      event,
    ];
    db.rows.job_postings = [
      { ...job, id: 'closed', is_open: false },
      { ...job, id: 'blocked', posted_by: 'blocked' },
      job,
      { ...job, id: 'older', title: 'Design lead', created_at: '2026-08-01' },
      { ...job, id: 'oldest', title: 'Oldest', created_at: '2026-01-01' },
    ];
    db.rows.channel_messages = [
      {
        channel_id: 'channel',
        sender_id: 'peer',
        created_at: '2026-09-17T12:00:00Z',
        channels: { chapter_id: 'chapter-a', name: 'general' },
      },
      {
        channel_id: 'secret-other-chapter',
        sender_id: 'peer',
        created_at: '2026-09-18',
        channels: { chapter_id: 'chapter-b', name: 'private' },
      },
      {
        channel_id: 'blocked-channel',
        sender_id: 'blocked',
        created_at: '2026-09-19',
        channels: { chapter_id: 'chapter-a', name: 'blocked' },
      },
    ];
    const ui = render(<Home />);
    fireEvent.press(await ui.findByText('Alumni dinner'));
    expect(push).toHaveBeenLastCalledWith({ pathname: '/events/[id]', params: { id: 'event' } });
    expect(ui.queryByText('Ended event')).toBeNull();
    expect(ui.queryByText('Oldest')).toBeNull();
    expect(ui.getByText('Design lead')).toBeTruthy();
    fireEvent.press(ui.getByText('Product engineer'));
    expect(push).toHaveBeenLastCalledWith({ pathname: '/jobs/[id]', params: { id: 'job' } });
    fireEvent.press(ui.getByText('# general'));
    expect(push).toHaveBeenLastCalledWith({
      pathname: '/chats/[channelId]',
      params: { channelId: 'channel' },
    });
    fireEvent.press(ui.getByText('Browse jobs'));
    expect(push).toHaveBeenLastCalledWith({ pathname: '/people', params: { view: 'jobs' } });
    for (const call of db.calls) {
      expect(call.steps.find(([method]) => method === 'select')?.[1]).not.toContain('*');
      if (call.table !== 'chapters' && call.table !== 'profiles')
        expect(call.steps.some(([method, count]) => method === 'limit' && count <= 2)).toBe(true);
    }
  });
  it('keeps successful sections on partial failure, retries only that section and preserves content during later failed refresh', async () => {
    db.rows.events = [event];
    db.queued.job_postings = [Promise.resolve({ data: null, error: { message: 'offline' } })];
    const ui = render(<Home />);
    await ui.findByText('Alumni dinner');
    expect(ui.queryByText('No open opportunities yet.')).toBeNull();
    db.rows.job_postings = [job];
    const before = db.calls.filter((c) => c.table === 'events').length;
    fireEvent.press(ui.getByText('Retry job opportunities'));
    await ui.findByText('Product engineer');
    expect(db.calls.filter((c) => c.table === 'events')).toHaveLength(before);
    const retry = deferred<Result>();
    db.queued.job_postings = [retry.promise];
    const { RefreshControl } = jest.requireActual<any>('react-native');
    fireEvent(ui.UNSAFE_getByType(RefreshControl), 'refresh');
    expect(ui.getByText('Product engineer')).toBeTruthy();
    await act(async () => retry.resolve({ data: null, error: { message: 'offline' } }));
    expect(ui.getByText('Product engineer')).toBeTruthy();
    expect(ui.getByText(/Couldn’t load job opportunities.*last loaded/)).toBeTruthy();
  });
  it.each(['account', 'chapter', 'removed', 'blocks', 'role'])(
    'clears old content and ignores delayed responses after %s changes',
    async (change) => {
      db.rows.events = [event];
      db.rows.job_postings = [job];
      const ui = render(<Home />);
      await ui.findByText('Alumni dinner');
      const late = deferred<Result>();
      db.queued.events = [late.promise];
      const { RefreshControl } = jest.requireActual<any>('react-native');
      fireEvent(ui.UNSAFE_getByType(RefreshControl), 'refresh');
      await act(async () => {});
      if (change === 'account')
        auth = {
          ...auth,
          session: { user: { id: 'user-b' } },
          profile: { ...auth.profile, user_id: 'user-b' },
        };
      if (change === 'chapter') auth.profile = { ...auth.profile, chapter_id: 'chapter-b' };
      if (change === 'removed') auth.profile = { ...auth.profile, status: 'rejected' };
      if (change === 'blocks') auth.blockedIds = new Set(['peer']);
      if (change === 'role') auth.profile = { ...auth.profile, membership_type: 'active' };
      db.rows.events = [];
      db.rows.job_postings = [];
      ui.rerender(<Home />);
      expect(ui.queryByText('Alumni dinner')).toBeNull();
      expect(ui.queryByText('Product engineer')).toBeNull();
      await act(async () =>
        late.resolve({ data: [{ ...event, title: 'Late private event' }], error: null }),
      );
      expect(ui.queryByText('Late private event')).toBeNull();
    },
  );
  it('removes an event when its start arrives even if the refresh fails', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-09-17T12:00:00Z'));
    try {
      db.rows.events = [{ ...event, starts_at: '2026-09-17T12:00:01Z' }];
      const ui = render(<Home />);
      await act(async () => {});
      expect(ui.getByText('Alumni dinner')).toBeTruthy();
      db.queued.events = [Promise.resolve({ data: null, error: { message: 'offline' } })];
      await act(async () => {
        jest.advanceTimersByTime(1001);
      });
      expect(ui.queryByText('Alumni dinner')).toBeNull();
      expect(ui.getByText('Retry upcoming event')).toBeTruthy();
      ui.unmount();
    } finally {
      jest.useRealTimers();
    }
  });
  it('reports chapter and conversation failures without inventing identity or empty activity', async () => {
    db.queued.chapters = [Promise.resolve({ data: null, error: { message: 'offline' } })];
    db.queued.channel_messages = [Promise.reject(new Error('offline'))];
    const ui = render(<Home />);
    await ui.findByText('Retry chapter identity');
    expect(ui.getByText('Retry conversation activity')).toBeTruthy();
    expect(ui.queryByText(/Browse your chapter channels/)).toBeNull();
  });
});

describe('Me profile and account actions', () => {
  it('shows a complete profile once, city without consent, and existing signals and destinations', async () => {
    auth.profile = { ...auth.profile, ...complete, open_to_mentor: true, is_hiring: true };
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    const ui = render(<Me />);
    await ui.findByText('Sigma Phi Epsilon · California Gamma · UCSB');
    expect(ui.getByText('Engineer · Example Studio')).toBeTruthy();
    expect(ui.queryByText('Engineer')).toBeNull();
    expect(ui.getByText('Alumni · Class of 2018')).toBeTruthy();
    for (const text of [
      'Technology · Austin',
      'Building useful things.',
      'Open to mentorship',
      'Hiring',
    ])
      expect(ui.getByText(text)).toBeTruthy();
    expect(ui.queryByText(/profile details complete/)).toBeNull();
    expect(
      ui.getByText('Map sharing is off. Your optional profile city is separate.'),
    ).toBeTruthy();
    fireEvent.press(ui.getByText('View LinkedIn profile'));
    expect(open).toHaveBeenCalledWith('https://linkedin.com/in/test');
    fireEvent.press(ui.getByText('Edit profile'));
    expect(push).toHaveBeenLastCalledWith('/profile/edit');
    fireEvent.press(ui.getByText('Manage map sharing'));
    expect(push).toHaveBeenLastCalledWith('/profile/edit');
    fireEvent.press(ui.getByText('Blocked members'));
    expect(push).toHaveBeenLastCalledWith('/settings/blocked');
    open.mockRestore();
  });
  it('keeps a modest sparse-profile nudge independent of city and map consent', async () => {
    const ui = render(<Me />);
    await ui.findByText(/0 of 5 profile details complete/);
    auth.profile = { ...auth.profile, city: null, map_sharing_enabled: true, lat: 30, lng: -97 };
    ui.rerender(<Me />);
    expect(ui.getByText(/0 of 5 profile details complete/)).toBeTruthy();
    expect(ui.queryByText('View LinkedIn profile')).toBeNull();
    expect(ui.queryByText('Hiring')).toBeNull();
  });
  it.each(['owner', 'manager', 'viewer', null])(
    'has five tabs for %s, with Admin and invitations gated',
    async (role) => {
      auth.profile.admin_role = role;
      const tabs = render(<TabsLayout />);
      for (const title of ['Home', 'Chats', 'Events', 'Network', 'Me'])
        expect(tabs.getByText(title)).toBeTruthy();
      expect(tabs.queryByText('Admin')).toBeNull();
      tabs.unmount();
      const ui = render(<Me />);
      await ui.findByText('Sigma Phi Epsilon · California Gamma · UCSB');
      const allowed = role === 'owner' || role === 'manager';
      expect(!!ui.queryByText('Admin')).toBe(allowed);
      if (allowed) {
        fireEvent.press(ui.getByText('Admin'));
        expect(push).toHaveBeenLastCalledWith('/(tabs)/admin');
      }
      ui.unmount();
      const home = render(<Home />);
      await home.findByLabelText('Sigma Phi Epsilon · California Gamma · UCSB');
      expect(!!home.queryByText('Chapter invitations')).toBe(allowed);
      if (allowed) {
        fireEvent.press(home.getByText('Chapter invitations'));
        expect(push).toHaveBeenLastCalledWith('/admin/settings');
      }
    },
  );
  it.each(['web', 'ios', 'android'] as const)(
    'renders cancel and confirm deletion controls on %s; submits once through the server endpoint',
    async (platform) => {
      const previous = Platform.OS;
      Platform.OS = platform;
      try {
        const ui = render(<Me />);
        await ui.findByText('Alex Morgan');
        fireEvent.press(ui.getByText('Delete account'));
        expect(supabase.functions.invoke).not.toHaveBeenCalled();
        fireEvent.press(ui.getByText('Cancel deletion'));
        expect(supabase.functions.invoke).not.toHaveBeenCalled();
        fireEvent.press(ui.getByText('Delete account'));
        const pending = deferred<any>();
        (jest.mocked(supabase.functions.invoke) as any).mockReturnValue(pending.promise);
        fireEvent.press(ui.getByText('Permanently delete account'));
        fireEvent.press(ui.getByText('Permanently delete account'));
        await waitFor(() => expect(supabase.functions.invoke).toHaveBeenCalledTimes(1));
        expect(supabase.functions.invoke).toHaveBeenCalledWith('delete-account', { body: {} });
        await act(async () => pending.resolve({ data: { success: true }, error: null }));
        expect(auth.signOut).toHaveBeenCalledTimes(1);
      } finally {
        Platform.OS = previous;
      }
    },
  );
  it.each([null, 'https://example.invalid/own-avatar.jpg'])(
    'delegates all cleanup to the server with avatar %s',
    async (avatar) => {
      auth.profile.avatar_url = avatar;
      const ui = render(<Me />);
      fireEvent.press(ui.getByText('Delete account'));
      fireEvent.press(ui.getByText('Permanently delete account'));
      await waitFor(() =>
        expect(supabase.functions.invoke).toHaveBeenCalledWith('delete-account', { body: {} }),
      );
      expect(supabase.storage.from).not.toHaveBeenCalled();
      expect(supabase.rpc).not.toHaveBeenCalled();
      expect(auth.signOut).toHaveBeenCalledTimes(1);
    },
  );
  it.each([
    { data: null, error: { message: 'cleanup failed' } },
    { data: { success: false }, error: null },
  ])(
    'preserves the account session on incomplete server cleanup and permits confirmed retry',
    async (failure) => {
      (jest.mocked(supabase.functions.invoke) as any).mockResolvedValueOnce(failure);
      const ui = render(<Me />);
      fireEvent.press(ui.getByText('Delete account'));
      fireEvent.press(ui.getByText('Permanently delete account'));
      await ui.findByText(/Couldn’t delete your account/);
      expect(auth.signOut).not.toHaveBeenCalled();
      fireEvent.press(ui.getByText('Delete account'));
      fireEvent.press(ui.getByText('Permanently delete account'));
      await waitFor(() => expect(auth.signOut).toHaveBeenCalledTimes(1));
    },
  );
  it('shows deletion failure and preserves sign-out recovery on web', async () => {
    (jest.mocked(supabase.functions.invoke) as any).mockRejectedValue(new Error('offline'));
    auth.signOut.mockRejectedValue(new Error('offline'));
    const ui = render(<Me />);
    fireEvent.press(ui.getByText('Delete account'));
    fireEvent.press(ui.getByText('Permanently delete account'));
    await ui.findByText(/Couldn’t delete your account/);
    expect(auth.signOut).not.toHaveBeenCalled();
    fireEvent.press(ui.getByText('Sign out'));
    await ui.findByText('Couldn’t sign out. Check your connection and try again.');
  });
  it('supports legal and support links and renders opening failures without browser alerts', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('no handler'));
    try {
      const ui = render(<Me />);
      fireEvent.press(ui.getByText('Privacy Policy'));
      await ui.findByText('Couldn’t open this link. Please try again.');
      expect(open.mock.calls[0][0]).toMatch(/^https:/);
      fireEvent.press(ui.getByText('Terms of Service'));
      await ui.findByText('Couldn’t open this link. Please try again.');
      fireEvent.press(ui.getByText('Contact support'));
      await ui.findByText(/Couldn’t open mail. Email/);
      expect(open.mock.calls[2][0]).toMatch(/^mailto:/);
    } finally {
      open.mockRestore();
    }
  });
  it('keeps profile details visible on chapter failure and recovers chapter identity independently', async () => {
    db.queued.chapters = [Promise.resolve({ data: null, error: { message: 'offline' } })];
    const ui = render(<Me />);
    expect(ui.getByText('Loading chapter identity…')).toBeTruthy();
    await ui.findByText('Retry chapter identity');
    expect(ui.getByText('Alex Morgan')).toBeTruthy();
    fireEvent.press(ui.getByText('Retry chapter identity'));
    await ui.findByText('Sigma Phi Epsilon · California Gamma · UCSB');
  });
  it('cancels confirmation on account change and never signs out a replacement account after delayed deletion', async () => {
    const pending = deferred<any>();
    (jest.mocked(supabase.functions.invoke) as any).mockReturnValue(pending.promise);
    const ui = render(<Me />);
    fireEvent.press(ui.getByText('Delete account'));
    fireEvent.press(ui.getByText('Permanently delete account'));
    await waitFor(() => expect(supabase.functions.invoke).toHaveBeenCalledTimes(1));
    auth = {
      ...auth,
      session: { user: { id: 'user-b' } },
      profile: { ...auth.profile, user_id: 'user-b', name: 'New Member', chapter_id: 'chapter-b' },
    };
    ui.rerender(<Me />);
    expect(ui.queryByText('Delete account?')).toBeNull();
    expect(ui.queryByText('Alex Morgan')).toBeNull();
    await act(async () => pending.resolve({ data: { success: true }, error: null }));
    expect(auth.signOut).not.toHaveBeenCalled();
    expect(await ui.findByText('Pi Beta Phi · California Zeta · UCSB')).toBeTruthy();
  });
});

describe('conversation discovery and mounted People shortcuts', () => {
  it('keeps directory loading, failure, retry and filtered empty states distinct', async () => {
    const read = {
      members: [],
      loading: false,
      error: null,
      reload: jest.fn(),
      loadMore: jest.fn(async () => {}),
      hasMore: false,
      loadingMore: false,
    };
    const reload = jest.fn();
    params = { membership: 'alumni' };
    jest.mocked(useChapterMembers).mockReturnValue({ ...read, loading: true, reload });
    const ui = render(<People />);
    expect(ui.queryByText('No members match your filters.')).toBeNull();
    expect(ui.queryByText(/members loaded/)).toBeNull();
    jest.mocked(useChapterMembers).mockReturnValue({
      ...read,
      loading: false,
      error: 'Couldn’t search members. Please retry.',
      reload,
    });
    ui.rerender(<People />);
    expect(ui.getByText('Couldn’t search members. Please retry.')).toBeTruthy();
    expect(ui.queryByText('No members match your filters.')).toBeNull();
    fireEvent.press(ui.getByText('Retry search'));
    expect(reload).toHaveBeenCalledTimes(1);
    jest
      .mocked(useChapterMembers)
      .mockReturnValue({ ...read, loading: false, error: null, reload });
    ui.rerender(<People />);
    expect(ui.getByText('No members match your filters.')).toBeTruthy();
    expect(ui.getByText('0 members loaded')).toBeTruthy();
    fireEvent.press(ui.getByRole('button', { name: 'All' }));
    expect(ui.getByText('No approved members are visible yet.')).toBeTruthy();
  });
  it('keeps mentorship reachable while channels load, with no invented unread badge', async () => {
    db.rows.channels = [];
    db.rows.mentorship_requests = [];
    db.queued.channels = [new Promise(() => {})];
    const ui = render(<Chats />);
    fireEvent.press(ui.getByRole('button', { name: 'Requests, review mentorship requests' }));
    expect(push).toHaveBeenLastCalledWith('/inbox');
    await ui.findByText('Sigma Phi Epsilon · California Gamma · UCSB');
  });
  it('applies repeated jobs shortcuts after manual segment changes without remounting People', async () => {
    const ui = render(<People />);
    params = { view: 'jobs' };
    ui.rerender(<People />);
    await ui.findByText('Post a job');
    expect(setParams).toHaveBeenCalledWith({
      view: undefined,
      filter: undefined,
      membership: undefined,
    });
    params = {};
    ui.rerender(<People />);
    fireEvent.press(ui.getByText('Directory'));
    expect(ui.queryByText('Post a job')).toBeNull();
    params = { view: 'jobs' };
    ui.rerender(<People />);
    await ui.findByText('Post a job');
  });
  it('mentor shortcut selects directory from Jobs and reapplies the filter on mounted directory', async () => {
    jest.mocked(useChapterMembers).mockReturnValue({
      members: [
        { id: 'mentor', name: 'Mentor Person', open_to_mentor: true },
        { id: 'other', name: 'Other Person', open_to_mentor: false },
      ] as any,
      loading: false,
      error: null,
      reload: jest.fn(),
      loadMore: jest.fn(async () => {}),
      hasMore: false,
      loadingMore: false,
    });
    params = { view: 'jobs' };
    const ui = render(<People />);
    await ui.findByText('Post a job');
    params = { filter: 'mentors' };
    ui.rerender(<People />);
    await ui.findByText('Mentor Person');
    expect(ui.queryByText('Other Person')).toBeNull();
    params = {};
    ui.rerender(<People />);
    fireEvent.press(ui.getByText('Mentors'));
    expect(ui.getByText('Other Person')).toBeTruthy();
    params = { filter: 'mentors' };
    ui.rerender(<People />);
    await waitFor(() => expect(ui.queryByText('Other Person')).toBeNull());
  });
  it('applies count shortcuts repeatedly from Jobs and keeps combined directory filters', async () => {
    params = { view: 'jobs' };
    const ui = render(<People />);
    await ui.findByText('Post a job');
    params = { view: 'directory', membership: 'active' };
    ui.rerender(<People />);
    expect(ui.getByRole('button', { name: 'Current members', selected: true })).toBeTruthy();
    params = {};
    ui.rerender(<People />);
    fireEvent.press(ui.getByRole('button', { name: 'Mentors' }));
    fireEvent.press(ui.getByRole('button', { name: 'Hiring' }));
    fireEvent.changeText(ui.getByPlaceholderText('Search by name, company, city'), 'QA Lab');
    fireEvent.changeText(ui.getByPlaceholderText('e.g. Technology'), 'Technology');
    await waitFor(() =>
      expect(useChapterMembers).toHaveBeenLastCalledWith(
        'chapter-a',
        auth.blockedIds,
        expect.objectContaining({
          query: 'QA Lab',
          mentorsOnly: true,
          hiringOnly: true,
          industry: 'Technology',
          membershipType: 'active',
        }),
      ),
    );
    params = { view: 'directory', membership: 'alumni' };
    ui.rerender(<People />);
    expect(ui.getByRole('button', { name: 'Alumni', selected: true })).toBeTruthy();
    expect(useChapterMembers).toHaveBeenLastCalledWith(
      'chapter-a',
      auth.blockedIds,
      expect.objectContaining({
        query: 'QA Lab',
        mentorsOnly: true,
        hiringOnly: true,
        industry: 'Technology',
        membershipType: 'alumni',
      }),
    );
    params = {};
    ui.rerender(<People />);
    fireEvent.press(ui.getByRole('button', { name: 'All', selected: false }));
    expect(useChapterMembers).toHaveBeenLastCalledWith(
      'chapter-a',
      auth.blockedIds,
      expect.objectContaining({ membershipType: null, mentorsOnly: true, hiringOnly: true }),
    );
  });
});

describe('owner-only QA deletion availability', () => {
  it('clearly disables deletion before confirmation or any destructive request', async () => {
    Object.defineProperty(qaBuild, 'isOwnerQaBuild', { configurable: true, value: true });
    try {
      const ui = render(<Me />);
      await act(async () => {});
      expect(ui.getByText(qaBuild.ownerQaDeletionNotice)).toBeTruthy();
      const unavailable = ui.getByRole('button', { name: 'Account deletion unavailable' });
      expect(unavailable.props.accessibilityState.disabled).toBe(true);
      fireEvent.press(unavailable);
      expect(ui.queryByText('Delete account?')).toBeNull();
      expect(ui.queryByText('Permanently delete account')).toBeNull();
      expect(supabase.functions.invoke).not.toHaveBeenCalled();
      expect(supabase.rpc).not.toHaveBeenCalled();
      expect(supabase.storage.from).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(qaBuild, 'isOwnerQaBuild', { configurable: true, value: false });
    }
  });
});
