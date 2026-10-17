import { beforeEach, expect, it, jest } from '@jest/globals';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Platform, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useChapterMembers } from '@/lib/queries';
import { useJobs } from '@/lib/jobs';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import People from '@/app/(tabs)/people';
import Home from '@/app/(tabs)/index';
import { MemberCard } from '@/components/MemberCard';
import { JobCard } from '@/components/JobCard';
import { SearchBar } from '@/components/SearchBar';
import { Chip } from '@/components/Chip';
import { homeDb } from '../helpers/home-db';

jest.mock('@/lib/auth', () => ({ useAuth: jest.fn() }));
jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn(), rpc: jest.fn() } }));
jest.mock('@/lib/queries', () => ({ useChapterMembers: jest.fn() }));
jest.mock('@/lib/jobs', () => ({ useJobs: jest.fn() }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useFocusEffect: jest.fn(),
  useLocalSearchParams: () => mockParams,
}));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: jest.fn(),
}));
jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual<any>('react-native-safe-area-context/jest/mock').default,
);
const mockRouter = { push: jest.fn(), setParams: jest.fn() };
let mockParams: any;
const reload = jest.fn(),
  loadMore = jest.fn(async () => {});
const base = { loading: false, error: null, reload, loadMore, hasMore: false, loadingMore: false };
const member = {
  id: 'member',
  name: 'Alexandra Jordan Taylor Nguyen',
  job_title: 'Senior product designer',
  company: 'Northline Research and Development',
  city: 'San Francisco, California',
  industry: 'Technology',
  membership_type: 'alumni',
  class_year: 2022,
  open_to_mentor: true,
  is_hiring: true,
} as any;
const job = {
  id: 'job',
  title: 'Product design intern — platforms and collaboration',
  company: 'Northline Research and Development',
  location: 'Santa Barbara, California',
  industry: 'Technology',
  created_at: '2026-10-12T12:00:00Z',
} as any;
beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
  jest
    .mocked(useWindowDimensions)
    .mockReturnValue({ width: 360, height: 844, scale: 1, fontScale: 1 });
  jest.mocked(useAuth).mockReturnValue({
    session: { user: { id: 'me' } },
    profile: {
      user_id: 'me',
      chapter_id: 'chapter-a',
      status: 'approved',
      membership_type: 'active',
    },
    blockedIds: new Set(),
  } as any);
  jest.mocked(supabase.from).mockImplementation(homeDb().from);
  jest.mocked(useChapterMembers).mockReturnValue({ ...base, members: [member] });
  jest.mocked(useJobs).mockReturnValue({ ...base, jobs: [job] });
});

it('Home opens the existing mentor directory shortcut', async () => {
  const ui = render(<Home />);
  await ui.findByLabelText('Sigma Phi Epsilon · California Gamma · UCSB');
  fireEvent.press(ui.getByRole('button', { name: 'Find mentors' }));
  expect(mockRouter.push).toHaveBeenCalledWith({
    pathname: '/people',
    params: { filter: 'mentors' },
  });
});
it('clears all combined directory filters and waits for the debounced query to settle', async () => {
  const ui = render(<People />);
  for (const name of ['Alumni', 'Mentors', 'Hiring'])
    fireEvent.press(ui.UNSAFE_getAllByType(Chip).find((chip) => chip.props.label === name)!);
  fireEvent.changeText(ui.getByPlaceholderText('Search by name, company, city'), 'Northline');
  fireEvent.changeText(ui.getByPlaceholderText('e.g. Technology'), 'Technology');
  expect(ui.getByText('Searching members…')).toBeTruthy();
  expect(ui.queryByText(member.name)).toBeNull();
  fireEvent.press(ui.getByRole('button', { name: 'Clear filters' }));
  await waitFor(() =>
    expect(useChapterMembers).toHaveBeenLastCalledWith('chapter-a', expect.any(Set), {
      query: '',
      mentorsOnly: false,
      hiringOnly: false,
      industry: null,
      membershipType: null,
    }),
  );
  expect(ui.getByRole('button', { name: 'All', selected: true })).toBeTruthy();
  expect(ui.getByText(member.name)).toBeTruthy();
});
it('Jobs exposes recovery alongside retained cards, without leaking backend error text', () => {
  mockParams = { view: 'jobs' };
  jest.mocked(useJobs).mockReturnValue({ ...base, jobs: [job], error: 'SQL private diagnostic' });
  const ui = render(<People />);
  expect(ui.getByText(job.title)).toBeTruthy();
  expect(ui.getByRole('alert').props.children.join('')).toContain(
    'Showing the last loaded opportunities.',
  );
  expect(ui.queryByText(/SQL private/)).toBeNull();
  fireEvent.press(ui.getByRole('button', { name: 'Retry jobs' }));
  expect(reload).toHaveBeenCalledTimes(1);
  jest.mocked(useJobs).mockReturnValue({ ...base, jobs: [job], loading: true });
  ui.rerender(<People />);
  expect(ui.getByText('Updating jobs…')).toBeTruthy();
  jest.mocked(useJobs).mockReturnValue({ ...base, jobs: [] });
  ui.rerender(<People />);
  expect(ui.getByText('No openings yet. Be the first to post one.')).toBeTruthy();
});
it('distinguishes initial jobs loading, failure and genuine empty content', () => {
  mockParams = { view: 'jobs' };
  jest.mocked(useJobs).mockReturnValue({ ...base, jobs: [], loading: true });
  const ui = render(<People />);
  expect(ui.getByText('Loading jobs…')).toBeTruthy();
  expect(ui.queryByText('No openings yet. Be the first to post one.')).toBeNull();
  jest.mocked(useJobs).mockReturnValue({ ...base, jobs: [], error: 'offline' });
  ui.rerender(<People />);
  expect(ui.getByRole('button', { name: 'Retry jobs' })).toBeTruthy();
  expect(ui.queryByText('No openings yet. Be the first to post one.')).toBeNull();
});
it('keeps jobs filters conjunctive, explains filtered emptiness and clears them', () => {
  mockParams = { view: 'jobs' };
  jest.mocked(useJobs).mockReturnValue({
    ...base,
    jobs: [
      job,
      {
        ...job,
        id: 'other',
        title: 'Finance associate',
        industry: 'Finance',
        location: 'New York',
      },
    ],
  });
  const ui = render(<People />);
  fireEvent.press(ui.UNSAFE_getAllByType(Chip).find((chip) => chip.props.label === 'Technology')!);
  fireEvent.press(ui.UNSAFE_getAllByType(Chip).find((chip) => chip.props.label === 'New York')!);
  expect(ui.getByText('No loaded jobs match your search or filters.')).toBeTruthy();
  expect(ui.queryByText('Be the first to post one.')).toBeNull();
  fireEvent.press(ui.getByRole('button', { name: 'Clear job filters' }));
  expect(ui.getByText(job.title)).toBeTruthy();
  expect(ui.getByText('Finance associate')).toBeTruthy();
  fireEvent.changeText(ui.getByPlaceholderText('Search jobs by title, company'), 'NO MATCH');
  expect(ui.getByText('No loaded jobs match your search or filters.')).toBeTruthy();
  fireEvent.press(ui.getByRole('button', { name: 'Clear search' }));
  expect(ui.getByText(job.title)).toBeTruthy();
});
it('offers keyboard-reachable jobs pagination and replaces it during pending reads', () => {
  mockParams = { view: 'jobs' };
  jest.mocked(useJobs).mockReturnValue({ ...base, jobs: [job], hasMore: true });
  const ui = render(<People />);
  jest.mocked(useJobs).mockReturnValue({ ...base, jobs: [job], hasMore: true, loading: true });
  ui.rerender(<People />);
  expect(ui.getByRole('button', { name: 'Load more jobs' }).props.accessibilityState.disabled).toBe(
    true,
  );
  fireEvent.press(ui.getByRole('button', { name: 'Load more jobs' }));
  expect(loadMore).not.toHaveBeenCalled();
  jest.mocked(useJobs).mockReturnValue({ ...base, jobs: [job], hasMore: true });
  ui.rerender(<People />);
  fireEvent.press(ui.getByRole('button', { name: 'Load more jobs' }));
  expect(loadMore).toHaveBeenCalledTimes(1);
  jest.mocked(useJobs).mockReturnValue({ ...base, jobs: [job], hasMore: true, loadingMore: true });
  ui.rerender(<People />);
  expect(ui.queryByRole('button', { name: 'Load more jobs' })).toBeNull();
});
it('preserves full member/job identity and routes into existing destinations', () => {
  const ui = render(<People />);
  expect(ui.getByText(member.name).props.numberOfLines).toBeUndefined();
  expect(ui.getByText('Technology · San Francisco, California')).toBeTruthy();
  expect(ui.getByText('Alumni · Class of 2022')).toBeTruthy();
  fireEvent.press(ui.getByText('View profile'));
  expect(mockRouter.push).toHaveBeenLastCalledWith({
    pathname: '/profile/[id]',
    params: { id: 'member' },
  });
  fireEvent.press(ui.getByRole('button', { name: 'Jobs' }));
  expect(ui.getByText(job.title).props.numberOfLines).toBeUndefined();
  fireEvent.press(ui.getByText('View job'));
  expect(mockRouter.push).toHaveBeenLastCalledWith({
    pathname: '/jobs/[id]',
    params: { id: 'job' },
  });
  fireEvent.press(ui.getByRole('button', { name: 'Post a job' }));
  expect(mockRouter.push).toHaveBeenLastCalledWith('/jobs/new');
});
it('wires native font scale to stacked member cards while leaving text scaling uncapped', () => {
  jest
    .mocked(useWindowDimensions)
    .mockReturnValue({ width: 430, height: 844, scale: 1, fontScale: 1.6 });
  const ui = render(<MemberCard profile={member} onPress={jest.fn()} />);
  expect(
    ui
      .UNSAFE_getAllByType(View)
      .some((v) => StyleSheet.flatten(v.props.style)?.flexDirection === 'column'),
  ).toBe(true);
  for (const text of [
    member.name,
    'Senior product designer at Northline Research and Development',
  ]) {
    expect(ui.getByText(text).props.allowFontScaling).not.toBe(false);
    expect(ui.getByText(text).props.maxFontSizeMultiplier).toBeUndefined();
  }
});
it('retains compact member and noninteractive job consumers and default admin search styling', () => {
  const memberUi = render(<MemberCard profile={member} variant="compact" />);
  expect(memberUi.getByText('Mentor')).toBeTruthy();
  expect(memberUi.queryByText('View profile')).toBeNull();
  memberUi.unmount();
  const jobUi = render(<JobCard job={job} />);
  expect(jobUi.queryByText('View job')).toBeNull();
  jobUi.unmount();
  const ui = render(<SearchBar value="Admin query" onChangeText={jest.fn()} />);
  expect(ui.getByLabelText('Search')).toBeTruthy();
  expect(
    ui.UNSAFE_getAllByType(View).some((v) => StyleSheet.flatten(v.props.style)?.height === 44),
  ).toBe(true);
});

it('exposes pressed filter and segment states on web while retaining native selection', () => {
  const old = Platform.OS;
  Platform.OS = 'web';
  try {
    const ui = render(<People />);
    const chip = ui.UNSAFE_getAllByType(Chip).find((c) => c.props.label === 'Mentors')!;
    fireEvent.press(chip);
    expect(
      ui
        .getAllByRole('button')
        .some(
          (b) => b.props['aria-pressed'] === true && b.props.accessibilityState?.selected === true,
        ),
    ).toBe(true);
    expect(ui.getByRole('button', { name: 'Directory' }).props['aria-pressed']).toBe(true);
    fireEvent.press(ui.getByRole('button', { name: 'Jobs' }));
    expect(ui.getByRole('button', { name: 'Jobs' }).props['aria-pressed']).toBe(true);
  } finally {
    Platform.OS = old;
  }
});

it('keeps sparse member cards concise without duplicating the fallback name or inferring signals', () => {
  const ui = render(
    <MemberCard
      profile={{
        ...member,
        name: null,
        job_title: null,
        company: null,
        role: null,
        city: null,
        industry: null,
        class_year: null,
        membership_type: 'active',
        open_to_mentor: false,
        is_hiring: false,
      }}
      onPress={jest.fn()}
    />,
  );
  expect(ui.getAllByText('Member')).toHaveLength(1);
  expect(ui.getByText('Current member')).toBeTruthy();
  expect(ui.queryByText('Open to mentor')).toBeNull();
  expect(ui.queryByText('Hiring')).toBeNull();
});
