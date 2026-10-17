import { beforeEach, expect, it, jest } from '@jest/globals';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { useJob, updateJob, createJob } from '@/lib/jobs';
import EditJob from '@/app/jobs/edit/[id]';
import NewJob from '@/app/jobs/new';
jest.mock('@/lib/auth', () => ({
  useAuth: () => ({
    session: { user: { id: 'me' } },
    profile: { user_id: 'me', chapter_id: 'chapter', status: 'approved' },
    blockedIds: new Set(),
  }),
}));
jest.mock('@/lib/jobs', () => ({ useJob: jest.fn(), updateJob: jest.fn(), createJob: jest.fn() }));
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => ({ id: 'job-a' }),
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual<any>('react-native-safe-area-context/jest/mock').default,
);
const mockRouter = { back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn() };
beforeEach(() => {
  jest.clearAllMocks();
  mockRouter.canGoBack.mockReturnValue(false);
  jest.mocked(useJob).mockReturnValue({
    loading: false,
    job: { id: 'job-a', posted_by: 'me', title: 'Career role', company: 'Studio' },
  } as any);
  jest.mocked(updateJob).mockResolvedValue({ error: null });
  jest.mocked(createJob).mockResolvedValue({ id: 'new-job', error: null });
});
it('returns a directly opened job editor to the existing job after an acknowledged save', async () => {
  const ui = render(<EditJob />);
  fireEvent.press(ui.getByText('Save changes'));
  await waitFor(() =>
    expect(mockRouter.replace).toHaveBeenCalledWith({
      pathname: '/jobs/[id]',
      params: { id: 'job-a' },
    }),
  );
  expect(mockRouter.back).not.toHaveBeenCalled();
});
it('keeps existing Back navigation when history exists', async () => {
  mockRouter.canGoBack.mockReturnValue(true);
  const ui = render(<EditJob />);
  fireEvent.press(ui.getByText('Save changes'));
  await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
  expect(mockRouter.replace).not.toHaveBeenCalled();
});
it('retains the editor and feedback after a zero-row or denied save', async () => {
  jest
    .mocked(updateJob)
    .mockResolvedValue({ error: 'This posting could not be updated. Refresh it and try again.' });
  const ui = render(<EditJob />);
  fireEvent.press(ui.getByText('Save changes'));
  await ui.findByText(/could not be updated/);
  expect(mockRouter.back).not.toHaveBeenCalled();
  expect(mockRouter.replace).not.toHaveBeenCalled();
  expect(ui.getByDisplayValue('Career role')).toBeTruthy();
});
it('returns a directly opened posting form to Jobs after saving', async () => {
  const ui = render(<NewJob />);
  fireEvent.changeText(ui.getByPlaceholderText('Software Engineer'), 'New career role');
  fireEvent.changeText(ui.getByPlaceholderText('Acme Inc.'), 'Studio');
  fireEvent.press(ui.getByText('Post job'));
  await waitFor(() =>
    expect(mockRouter.replace).toHaveBeenCalledWith({
      pathname: '/people',
      params: { view: 'jobs' },
    }),
  );
});
