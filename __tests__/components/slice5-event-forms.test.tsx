import { beforeEach, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { useAuth } from '@/lib/auth';
import { useEvent, createEvent, updateEvent } from '@/lib/events';
import { useLocalSearchParams, useRouter } from 'expo-router';
import NewEvent from '@/app/events/new';
import EditEvent from '@/app/events/edit/[id]';
import { toLocalDateTimeFields } from '@/lib/time';
import { deferred } from '../helpers/home-db';

jest.mock('@/lib/auth', () => ({ useAuth: jest.fn() }));
jest.mock('@/lib/events', () => ({
  useEvent: jest.fn(),
  createEvent: jest.fn(),
  updateEvent: jest.fn(),
  EVENT_CATEGORIES: [{ value: 'chapter', label: 'Chapter' }],
}));
jest.mock('expo-router', () => ({ useLocalSearchParams: jest.fn(), useRouter: jest.fn() }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual<any>('react-native-safe-area-context/jest/mock').default,
);
jest.mock('@/components/EventDateInput', () => ({
  EventDateInput: ({ label, date, time, onDate, onTime }: any) => {
    const React = jest.requireActual<any>('react');
    const { View, Text, TextInput } = jest.requireActual<any>('react-native');
    return React.createElement(
      View,
      null,
      React.createElement(Text, null, label),
      React.createElement(TextInput, {
        accessibilityLabel: `${label} date`,
        value: date,
        onChangeText: onDate,
      }),
      React.createElement(TextInput, {
        accessibilityLabel: `${label} time`,
        value: time,
        onChangeText: onTime,
      }),
    );
  },
}));
let auth: any, event: any;
const back = jest.fn();
beforeEach(() => {
  jest.clearAllMocks();
  auth = {
    session: { user: { id: 'user' } },
    profile: { chapter_id: 'chapter', status: 'approved' },
    blockedIds: new Set(),
  };
  event = {
    id: 'event',
    title: 'Dinner',
    created_by: 'user',
    chapter_id: 'chapter',
    starts_at: '2026-11-01T09:30:42.123Z',
    ends_at: '2026-11-01T10:30:12.345Z',
    category: 'chapter',
  };
  jest.mocked(useAuth).mockImplementation(() => auth);
  jest.mocked(useRouter).mockReturnValue({ back } as any);
  jest.mocked(useLocalSearchParams).mockReturnValue({ id: 'event' });
  jest
    .mocked(useEvent)
    .mockImplementation(() => ({ event, loading: false, error: null, reload: jest.fn() }) as any);
  jest.mocked(createEvent).mockResolvedValue({ error: null });
  jest.mocked(updateEvent).mockResolvedValue({ error: null });
});
it('reopening and saving an unchanged event preserves start/end instants including seconds', async () => {
  const ui = render(<EditEvent />);
  await waitFor(() =>
    expect(ui.getByLabelText('Start date').props.value).toBe(
      toLocalDateTimeFields(event.starts_at).date,
    ),
  );
  fireEvent.press(ui.getByText('Save changes'));
  await waitFor(() => expect(updateEvent).toHaveBeenCalledTimes(1));
  expect(updateEvent).toHaveBeenCalledWith(
    'event',
    expect.objectContaining({ starts_at: event.starts_at, ends_at: event.ends_at }),
  );
});
it('rejects invalid and rolled-over input before create, and prevents an end before start', async () => {
  const ui = render(<NewEvent />);
  fireEvent.changeText(ui.getByPlaceholderText('Chapter meeting'), 'Dinner');
  fireEvent.changeText(ui.getByLabelText('Start date'), '2026-02-30');
  fireEvent.changeText(ui.getByLabelText('Start time'), '12:00');
  fireEvent.press(ui.getByText('Create event'));
  expect(ui.getByText(/Choose a valid local date/)).toBeTruthy();
  expect(createEvent).not.toHaveBeenCalled();
  fireEvent.changeText(ui.getByLabelText('Start date'), '2026-03-01');
  fireEvent.changeText(ui.getByLabelText('End (optional) date'), '2026-03-01');
  fireEvent.changeText(ui.getByLabelText('End (optional) time'), '11:00');
  fireEvent.press(ui.getByText('Create event'));
  expect(ui.getByText(/Choose a valid end time after/)).toBeTruthy();
  expect(createEvent).not.toHaveBeenCalled();
});
it('serializes submission and ignores navigation from an obsolete account form', async () => {
  const late = deferred<{ error: null }>();
  jest.mocked(createEvent).mockReturnValue(late.promise);
  const ui = render(<NewEvent />);
  fireEvent.changeText(ui.getByPlaceholderText('Chapter meeting'), 'Dinner');
  fireEvent.changeText(ui.getByLabelText('Start date'), '2026-10-01');
  fireEvent.changeText(ui.getByLabelText('Start time'), '12:00');
  const button = ui.getByText('Create event');
  fireEvent.press(button);
  fireEvent.press(button);
  expect(createEvent).toHaveBeenCalledTimes(1);
  auth = { ...auth, session: { user: { id: 'other' } } };
  ui.rerender(<NewEvent />);
  await act(async () => late.resolve({ error: null }));
  expect(back).not.toHaveBeenCalled();
});
it('an edited start cannot silently leave an earlier saved end', async () => {
  const ui = render(<EditEvent />);
  await waitFor(() => expect(ui.getByLabelText('Start date').props.value).toBeTruthy());
  fireEvent.changeText(ui.getByLabelText('Start date'), '2099-01-01');
  fireEvent.press(ui.getByText('Save changes'));
  expect(ui.getByText(/Choose a valid end time after/)).toBeTruthy();
  expect(updateEvent).not.toHaveBeenCalled();
});
