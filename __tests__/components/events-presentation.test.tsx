import { beforeEach, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import Events from '@/app/(tabs)/events';
import EventDetail from '@/app/events/[id]';
import { useAuth } from '@/lib/auth';
import { useEvent, useEvents, deleteEvent } from '@/lib/events';
import { Button } from '@/components/Button';

jest.mock('@/lib/auth', () => ({ useAuth: jest.fn() }));
jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn() } }));
jest.mock('@/lib/events', () => ({
  ...jest.requireActual<any>('@/lib/events'),
  useEvents: jest.fn(),
  useEvent: jest.fn(),
  useEventClock: () => Date.parse('2026-10-10T16:00:00Z'),
  deleteEvent: jest.fn(),
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('@/components/ShareToChat', () => ({ ShareToChat: () => null }));
jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual<any>('react-native-safe-area-context/jest/mock').default,
);
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack }),
  useLocalSearchParams: () => ({ id: 'dinner' }),
  useFocusEffect: (callback: () => void | (() => void)) => {
    const React = jest.requireActual<any>('react');
    React.useEffect(callback, [callback]);
  },
}));

const mockPush = jest.fn(),
  mockBack = jest.fn();
const reload = jest.fn(),
  saveRsvp = jest.fn();
const dinner = {
  id: 'dinner',
  chapter_id: 'chapter',
  created_by: 'host',
  title: 'Alumni dinner & career conversations',
  category: 'alumni',
  starts_at: '2099-10-16T18:30:00Z',
  ends_at: '2099-10-16T20:30:00Z',
  location: 'Chapter house',
  description: 'Bring a question or just yourself.',
  goingCount: 18,
  maybeCount: 6,
  myStatus: 'maybe',
  attendees: [],
  metaError: null,
};
const cleanup = { ...dinner, id: 'cleanup', category: 'philanthropy', title: 'Coastal cleanup' };
let auth: any, list: any, detail: any;
beforeEach(() => {
  jest.clearAllMocks();
  auth = {
    session: { user: { id: 'self' } },
    profile: { chapter_id: 'chapter', status: 'approved', admin_role: null },
    blockedIds: new Set(),
  };
  list = { events: [dinner, cleanup], loading: false, error: null, reload };
  detail = {
    ...dinner,
    event: dinner,
    creator: null,
    saving: false,
    saveError: null,
    loading: false,
    error: null,
    reload,
    saveRsvp,
  };
  jest.mocked(useAuth).mockImplementation(() => auth);
  jest.mocked(useEvents).mockImplementation(() => list);
  jest.mocked(useEvent).mockImplementation(() => detail);
  jest.mocked(deleteEvent).mockResolvedValue({ error: null });
});

it('preserves combined category filtering and All clears the selection', () => {
  const ui = render(<Events />);
  fireEvent.press(ui.getByRole('button', { name: 'Alumni' }));
  expect(ui.queryByText('Coastal cleanup')).toBeNull();
  fireEvent.press(ui.getByRole('button', { name: 'Philanthropy' }));
  expect(ui.getByText('Coastal cleanup')).toBeTruthy();
  expect(ui.getByText(dinner.title)).toBeTruthy();
  fireEvent.press(ui.getByRole('button', { name: 'All' }));
  expect(ui.getByRole('button', { name: 'All' }).props.accessibilityState.selected).toBe(true);
  expect(ui.getByRole('button', { name: 'Alumni' }).props.accessibilityState.selected).toBe(false);
});
it('preserves event/create routes and full event titles', () => {
  const title =
    'Finding your first role: a conversation with alumni in product, engineering, and the creative industries';
  list.events = [{ ...dinner, title }];
  const ui = render(<Events />);
  expect(ui.getByText(title).props.numberOfLines).toBeUndefined();
  fireEvent.press(ui.getByText(title));
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/events/[id]', params: { id: 'dinner' } });
  fireEvent.press(ui.getByRole('button', { name: 'Create event' }));
  expect(mockPush).toHaveBeenCalledWith('/events/new');
});
it('distinguishes loading, empty and fetch failure without inventing empty data on failure', () => {
  list = { ...list, events: [], loading: true };
  const ui = render(<Events />);
  expect(ui.getByText('Loading events…')).toBeTruthy();
  expect(ui.queryByText('Nothing on the calendar yet')).toBeNull();
  list = { ...list, loading: false, error: 'Couldn’t load events. Please retry.' };
  ui.rerender(<Events />);
  expect(ui.getByText('Events couldn’t load')).toBeTruthy();
  expect(ui.queryByText('Nothing on the calendar yet')).toBeNull();
  const initialReloads = reload.mock.calls.length;
  fireEvent.press(ui.getByRole('button', { name: 'Retry' }));
  expect(reload).toHaveBeenCalledTimes(initialReloads + 1);
  list = { ...list, error: null };
  ui.rerender(<Events />);
  expect(ui.getByText('Nothing on the calendar yet')).toBeTruthy();
  expect(ui.getByRole('button', { name: 'Create an event' })).toBeTruthy();
});
it('retains rows through refresh errors and exposes retry', () => {
  list.error = 'Couldn’t refresh events.';
  const ui = render(<Events />);
  expect(ui.getByText(dinner.title)).toBeTruthy();
  expect(ui.getByText(/Previously loaded information may be shown/)).toBeTruthy();
  expect(ui.getByRole('button', { name: 'Retry' })).toBeTruthy();
});
it('dispatches existing RSVP values, exposes selection and keeps response during saving/failure', () => {
  const ui = render(<EventDetail />);
  expect(ui.getByRole('button', { name: 'Interested' }).props.accessibilityState.selected).toBe(
    true,
  );
  fireEvent.press(ui.getByRole('button', { name: 'Going' }));
  expect(saveRsvp).toHaveBeenCalledWith('going');
  detail = { ...detail, saving: true };
  ui.rerender(<EventDetail />);
  expect(ui.getByText('Your response: Interested')).toBeTruthy();
  for (const label of ['Going', 'Interested', 'Can’t go']) {
    const state = ui.getByRole('button', { name: label }).props.accessibilityState;
    expect(state.disabled).toBe(true);
    expect(state.busy).toBe(true);
  }
  detail = { ...detail, saving: false, saveError: 'Couldn’t confirm your response.' };
  ui.rerender(<EventDetail />);
  expect(ui.getByText('Your response: Interested')).toBeTruthy();
  fireEvent.press(ui.getByRole('button', { name: 'Retry attendance and details' }));
  expect(saveRsvp).toHaveBeenCalledTimes(1);
  expect(ui.getByText('Couldn’t confirm your response.')).toBeTruthy();
});
it('does not treat unavailable attendance as zero or enable an unknown RSVP', () => {
  detail = {
    ...detail,
    goingCount: null,
    myStatus: undefined,
    metaError: 'Attendance unavailable. Retry to refresh.',
  };
  const ui = render(<EventDetail />);
  expect(ui.getByText('Attendance unavailable')).toBeTruthy();
  expect(ui.queryByText(/0 going/)).toBeNull();
  expect(ui.getByRole('button', { name: 'Going' }).props.accessibilityState.disabled).toBe(true);
});
it('keeps read failure distinct from unavailable event and preserves back navigation', () => {
  detail = { ...detail, event: null, error: 'Couldn’t load this event.' };
  const ui = render(<EventDetail />);
  expect(ui.getByText('Event couldn’t load')).toBeTruthy();
  expect(ui.getByText(/does not mean the event was deleted/)).toBeTruthy();
  expect(ui.queryByText('This event is removed or unavailable.')).toBeNull();
  fireEvent.press(ui.getByRole('button', { name: 'Go back' }));
  expect(mockBack).toHaveBeenCalledTimes(1);
  detail.error = null;
  ui.rerender(<EventDetail />);
  expect(ui.getByText('This event is removed or unavailable.')).toBeTruthy();
});
it('hides blocked guests and retains the creator profile destination', () => {
  auth.blockedIds = new Set(['blocked']);
  detail = {
    ...detail,
    creator: { id: 'host-profile', name: 'Avery Chen' },
    attendees: [
      { id: '1', user_id: 'blocked', name: 'Blocked person' },
      { id: '2', user_id: 'peer', name: 'Morgan Rivera' },
    ],
  };
  const ui = render(<EventDetail />);
  expect(ui.queryByText('Blocked person')).toBeNull();
  expect(ui.getByText('Morgan Rivera')).toBeTruthy();
  fireEvent.press(ui.getByRole('button', { name: 'View Avery Chen profile' }));
  expect(mockPush).toHaveBeenCalledWith({
    pathname: '/profile/[id]',
    params: { id: 'host-profile' },
  });
});
it.each(['member', 'owner', 'manager', 'pending owner'])(
  'preserves management authorization for %s',
  (role) => {
    if (role.includes('owner')) detail.event = { ...dinner, created_by: 'self' };
    if (role === 'manager') auth.profile.admin_role = 'manager';
    if (role === 'pending owner') auth.profile.status = 'pending';
    const ui = render(<EventDetail />);
    expect(!!ui.queryByRole('button', { name: 'Edit event' })).toBe(
      role === 'owner' || role === 'manager',
    );
  },
);
it('requires deletion confirmation and ignores an obsolete account completion', async () => {
  detail.event = { ...dinner, created_by: 'self' };
  let finish!: (value: { error: null }) => void;
  jest.mocked(deleteEvent).mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const ui = render(<EventDetail />);
  fireEvent.press(ui.getByRole('button', { name: 'Delete event' }));
  expect(deleteEvent).not.toHaveBeenCalled();
  fireEvent.press(ui.getByRole('button', { name: 'Cancel deletion' }));
  expect(ui.queryByText('Permanently delete event')).toBeNull();
  fireEvent.press(ui.getByRole('button', { name: 'Delete event' }));
  fireEvent.press(ui.getByRole('button', { name: 'Permanently delete event' }));
  await waitFor(() => expect(deleteEvent).toHaveBeenCalledWith('dinner'));
  auth = { ...auth, session: { user: { id: 'replacement' } } };
  ui.rerender(<EventDetail />);
  await act(async () => finish({ error: null }));
  expect(mockBack).not.toHaveBeenCalled();
});
it('merges selected accessibility state without losing disabled/loading protection', () => {
  const press = jest.fn();
  const ui = render(
    <Button
      tone="events"
      label="Going"
      loading
      accessibilityState={{ selected: true, disabled: false }}
      onPress={press}
    />,
  );
  const button = ui.getByRole('button', { name: 'Going' });
  expect(button.props.accessibilityState).toMatchObject({
    selected: true,
    disabled: true,
    busy: true,
  });
  fireEvent.press(button);
  expect(press).not.toHaveBeenCalled();
});

it('distinguishes guest preview loading, failure and a successful privacy-filtered empty result', () => {
  detail.attendeeState = 'loading';
  const ui = render(<EventDetail />);
  expect(ui.getByText('Loading guest preview…')).toBeTruthy();
  expect(ui.queryByText('No guest profiles are visible to you.')).toBeNull();
  detail.attendeeState = 'error';
  ui.rerender(<EventDetail />);
  expect(ui.getByText('Guest preview couldn’t refresh. Retry to check again.')).toBeTruthy();
  expect(ui.queryByText('No guest profiles are visible to you.')).toBeNull();
  detail.attendeeState = 'ready';
  ui.rerender(<EventDetail />);
  expect(ui.getByText('No guest profiles are visible to you.')).toBeTruthy();
});
