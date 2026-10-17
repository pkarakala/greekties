import { beforeEach, expect, it, jest } from '@jest/globals';
import { fireEvent, render } from '@testing-library/react-native';
import { ScrollView } from 'react-native';
import Detail from '@/app/events/[id]';
import { useAuth } from '@/lib/auth';
import { useEvent } from '@/lib/events';

jest.mock('@/lib/auth', () => ({ useAuth: jest.fn() }));
jest.mock('@/lib/events', () => ({ useEvent: jest.fn(), useEventClock: () => 0 }));
jest.mock('@/components/ShareToChat', () => ({ ShareToChat: () => null }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'event' }),
  useFocusEffect: jest.fn(),
}));
jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual<any>('react-native-safe-area-context/jest/mock').default,
);
const saveRsvp = jest.fn();
let data: any;
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useAuth).mockReturnValue({
    session: { user: { id: 'me' } },
    profile: { chapter_id: 'chapter', status: 'approved', admin_role: null },
    blockedIds: new Set(),
  } as any);
  data = {
    event: {
      id: 'event',
      created_by: 'peer',
      title: 'Chapter dinner',
      category: 'alumni',
      starts_at: '2099-11-07T00:00:00Z',
      description: 'Long event details remain scrollable.',
    },
    goingCount: 12,
    maybeCount: 4,
    myStatus: 'maybe',
    creator: null,
    attendees: [],
    attendeeState: 'ready',
    reload: jest.fn(),
    saveRsvp,
    loading: false,
    saving: false,
    error: null,
    saveError: null,
  };
  jest.mocked(useEvent).mockImplementation(() => data);
});
it('keeps RSVP controls outside scrollable details while preserving direct status writes', () => {
  const ui = render(<Detail />);
  const scroll = ui.UNSAFE_getByType(ScrollView);
  expect(scroll.findAllByProps({ testID: 'event-rsvp-dock' })).toHaveLength(0);
  expect(ui.getByTestId('event-rsvp-dock')).toBeTruthy();
  for (const [label, status] of [
    ['Going', 'going'],
    ['Interested', 'maybe'],
    ['Can’t go', 'declined'],
  ]) {
    fireEvent.press(ui.getByRole('button', { name: label }));
    expect(saveRsvp).toHaveBeenLastCalledWith(status);
  }
  expect(ui.getByText('Long event details remain scrollable.')).toBeTruthy();
});
it('retains the confirmed selected response while save failure remains recoverable', () => {
  data.saveError = 'Couldn’t confirm your response.';
  const ui = render(<Detail />);
  expect(ui.getByRole('button', { name: 'Interested', selected: true })).toBeTruthy();
  fireEvent.press(ui.getByRole('button', { name: 'Retry attendance and details' }));
  expect(data.reload).toHaveBeenCalledTimes(1);
  expect(saveRsvp).not.toHaveBeenCalled();
  expect(ui.getByRole('alert')).toBeTruthy();
});
it('disables dock choices while saving without disabling access to details', () => {
  data.saving = true;
  const ui = render(<Detail />);
  fireEvent.press(ui.getByRole('button', { name: 'Going', disabled: true }));
  expect(saveRsvp).not.toHaveBeenCalled();
  expect(ui.getByText('Saving your response…')).toBeTruthy();
  expect(ui.getByText('Long event details remain scrollable.')).toBeTruthy();
});
