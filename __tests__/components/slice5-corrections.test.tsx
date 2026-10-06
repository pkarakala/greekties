import { useState } from 'react';
import { beforeEach, afterEach, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Platform, Text } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { EventDateInput, type EventDateInputProps } from '@/components/EventDateInput';
import { ChatShareReview } from '@/components/ChatShareReview';
import { MessageComposer } from '@/components/MessageComposer';
import { prepareChatShare } from '@/lib/chat-share';
import {
  getMessageRecovery,
  useMessageRecovery,
  setMessageRecoveryAccount,
  confirmMessageRecoveryMembership,
  editMessageDraft,
  submitRecoveredMessage,
} from '@/lib/message-recovery';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { useEvent, createEvent, updateEvent } from '@/lib/events';
import { useLocalSearchParams, useRouter } from 'expo-router';
import NewEvent from '@/app/events/new';
import EditEvent from '@/app/events/edit/[id]';
import * as timeHelpers from '@/lib/time';
import { slice5Db, deferred, type Result } from '../helpers/slice5-db';

jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn(), rpc: jest.fn() } }));
jest.mock('@/lib/auth', () => ({ useAuth: jest.fn() }));
jest.mock('@/lib/events', () => ({
  useEvent: jest.fn(),
  createEvent: jest.fn(),
  updateEvent: jest.fn(),
  EVENT_CATEGORIES: [{ value: 'chapter', label: 'Chapter' }],
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual<any>('react-native-safe-area-context/jest/mock').default,
);
jest.mock('@react-native-community/datetimepicker', () => ({
  __esModule: true,
  default: jest.fn(() => null),
}));
// Invoke real effect lifecycles through an external focus store. Rerenders,
// blur, refocus, and unmount all execute the registered cleanup.
jest.mock('expo-router', () => ({
  useRouter: jest.fn(),
  useLocalSearchParams: jest.fn(),
  useFocusEffect: (callback: () => void | (() => void)) => {
    const React = jest.requireActual<any>('react');
    const focused = React.useSyncExternalStore(mockFocus.subscribe, mockFocus.snapshot);
    React.useEffect(() => (focused ? callback() : undefined), [focused, callback]);
  },
}));
const mockFocus = {
  focused: true,
  listeners: new Set<() => void>(),
  subscribe(listener: () => void) {
    mockFocus.listeners.add(listener);
    return () => {
      mockFocus.listeners.delete(listener);
    };
  },
  snapshot() {
    return mockFocus.focused;
  },
  set(value: boolean) {
    act(() => {
      mockFocus.focused = value;
      mockFocus.listeners.forEach((fn) => fn());
    });
  },
};
let db: ReturnType<typeof slice5Db>;
const resource = { kind: 'events' as const, id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' };
const originalPlatform = Platform.OS;
const event = {
  id: 'event',
  title: 'Dinner',
  created_by: 'user',
  chapter_id: 'chapter',
  starts_at: '2026-11-01T09:30:42.123Z',
  ends_at: '2026-11-01T10:30:12.345Z',
  category: 'chapter',
  location: 'Keep location',
  description: 'Keep notes',
};
beforeEach(() => {
  jest.clearAllMocks();
  mockFocus.focused = true;
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
  db = slice5Db();
  jest.mocked(supabase.from).mockImplementation(db.from);
  (jest.mocked(supabase.rpc) as any).mockResolvedValue({ data: true, error: null });
  db.rows.events = [{ id: resource.id, chapter_id: 'chapter', title: 'Dinner' }];
  db.rows.channels = [{ id: 'channel', chapter_id: 'chapter', name: 'general' }];
  setMessageRecoveryAccount(null);
  setMessageRecoveryAccount('user');
  confirmMessageRecoveryMembership('user', 'chapter');
  jest.mocked(useAuth).mockReturnValue({
    session: { user: { id: 'user' } },
    profile: { chapter_id: 'chapter', status: 'approved' },
    blockedIds: new Set(),
  } as any);
  jest.mocked(useRouter).mockReturnValue({ back: jest.fn() } as any);
  jest.mocked(useLocalSearchParams).mockReturnValue({ id: 'event' });
  jest
    .mocked(useEvent)
    .mockReturnValue({ event, loading: false, error: null, reload: jest.fn() } as any);
  jest.mocked(createEvent).mockResolvedValue({ error: null });
  jest.mocked(updateEvent).mockResolvedValue({ error: null });
});
afterEach(() => {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: originalPlatform });
  jest.restoreAllMocks();
});
function ShareHarness({ shareId }: { shareId: string }) {
  const composer = useMessageRecovery('channel', 'channel', 'user');
  return (
    <>
      <ChatShareReview entry={composer.entry} shareId={shareId} />
      <MessageComposer composer={composer} />
    </>
  );
}
function DateHarness({
  initialDate = '',
  initialTime = '',
  ...props
}: Partial<EventDateInputProps> & { initialDate?: string; initialTime?: string }) {
  const [date, onDate] = useState(initialDate),
    [time, onTime] = useState(initialTime);
  const [occurrence, onOccurrence] = useState<string | undefined>(props.occurrence);
  return (
    <>
      <EventDateInput
        label="Start"
        {...props}
        date={date}
        time={time}
        onDate={onDate}
        onTime={onTime}
        occurrence={occurrence}
        onOccurrence={onOccurrence}
      />
      <Text testID="values">{JSON.stringify({ date, time, occurrence })}</Text>
    </>
  );
}
function picker() {
  return jest.mocked(DateTimePicker).mock.calls.at(-1)![0];
}
function choose(value: Date, type = 'set') {
  act(() =>
    picker().onChange!({ type, nativeEvent: { timestamp: +value, utcOffset: 0 } } as any, value),
  );
}
it.each(['ios', 'android'] as const)(
  'preserves a date-first partial selection on %s and reopening does not commit a time',
  (platform) => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: platform });
    const ui = render(<DateHarness />);
    fireEvent.press(ui.getByText('Start date: Choose date'));
    choose(new Date(2099, 0, 5, 12));
    if (platform === 'ios') fireEvent.press(ui.getByText('Done'));
    fireEvent.press(ui.getByText('Start date: 2099-01-05'));
    expect(timeHelpers.toLocalDateTimeFields(picker().value.toISOString()).date).toBe('2099-01-05');
    expect(JSON.parse(ui.getByTestId('values').props.children)).toEqual({
      date: '2099-01-05',
      time: '',
    });
  },
);
it('retains a usable Add control when validation settles during blur', async () => {
  const share = await prepareChatShare(resource, 'channel', 'chapter', 'user', () => true);
  const late = deferred<Result>();
  db.setIntercept((c) => (c.table === 'events' ? late.promise : undefined));
  const ui = render(<ShareHarness shareId={share.id} />);
  fireEvent.press(ui.getByText('Add to draft'));
  await waitFor(() => expect(share.state).toBe('checking'));
  mockFocus.set(false);
  await act(async () => late.resolve({ data: db.rows.events[0], error: null }));
  mockFocus.set(true);
  expect(ui.getByRole('button', { name: 'Add to draft' }).props.accessibilityState.disabled).toBe(
    false,
  );
  expect(share.entry.state.draft).toBe('');
});
it('offers clearing the entire optional end inside the actual native control', () => {
  const ui = render(
    <DateHarness
      label="End (optional)"
      optional
      initialDate="2099-01-05"
      initialTime="19:30"
      occurrence="2099-01-05T19:30:00Z"
    />,
  );
  fireEvent.press(ui.getByText('Clear end time'));
  expect(JSON.parse(ui.getByTestId('values').props.children)).toEqual({ date: '', time: '' });
});

it.each(['success', 'error', 'throw'] as const)(
  'refocus can retry before the old %s check settles without its finally resetting the new run',
  async (outcome) => {
    const share = await prepareChatShare(resource, 'channel', 'chapter', 'user', () => true);
    const old = deferred<Result>(),
      fresh = deferred<Result>();
    let reads = 0;
    db.setIntercept((c) =>
      c.table === 'events' ? (++reads === 1 ? old.promise : fresh.promise) : undefined,
    );
    const ui = render(<ShareHarness shareId={share.id} />);
    fireEvent.press(ui.getByText('Add to draft'));
    await waitFor(() => expect(reads).toBe(1));
    mockFocus.set(false);
    mockFocus.set(true);
    expect(ui.getByRole('button', { name: 'Add to draft' }).props.accessibilityState.disabled).toBe(
      false,
    );
    expect(share.state).toBe('ready');
    fireEvent.press(ui.getByText('Add to draft'));
    await waitFor(() => expect(reads).toBe(2));
    await act(async () => {
      if (outcome === 'throw') old.reject(new Error('offline'));
      else
        old.resolve(
          outcome === 'error'
            ? { data: null, error: { message: 'denied' } }
            : { data: db.rows.events[0], error: null },
        );
    });
    expect(share.state).toBe('checking');
    expect(ui.getByRole('button', { name: 'Add to draft' }).props.accessibilityState.busy).toBe(
      true,
    );
    expect(ui.queryByText(/Couldn’t verify/)).toBeNull();
    expect(share.entry.state.draft).toBe('');
    await act(async () => fresh.resolve({ data: db.rows.events[0], error: null }));
    await waitFor(() => expect(share.entry.state.draft).toBe(share.text));
    expect(share.state).toBe('consumed');
    expect(share.entry.state.attempt).toBeNull();
  },
);
it.each(['before', 'after'] as const)(
  'a failed blurred check settling %s refocus leaves an explicit successful retry',
  async (timing) => {
    const share = await prepareChatShare(resource, 'channel', 'chapter', 'user', () => true);
    const late = deferred<Result>();
    db.setIntercept((c) => (c.table === 'events' ? late.promise : undefined));
    const ui = render(<ShareHarness shareId={share.id} />);
    fireEvent.press(ui.getByText('Add to draft'));
    mockFocus.set(false);
    if (timing === 'after') mockFocus.set(true);
    await act(async () => late.reject(new Error('offline')));
    if (timing === 'before') mockFocus.set(true);
    expect(ui.getByRole('button', { name: 'Add to draft' }).props.accessibilityState.disabled).toBe(
      false,
    );
    db.setIntercept(null);
    fireEvent.press(ui.getByText('Add to draft'));
    await waitFor(() => expect(share.entry.state.draft).toBe(share.text));
  },
);
it.each(['cancel', 'unmount', 'account', 'membership'] as const)(
  'a paused validation remains harmless after %s',
  async (transition) => {
    const share = await prepareChatShare(resource, 'channel', 'chapter', 'user', () => true);
    editMessageDraft(share.entry, 'Keep draft');
    const late = deferred<Result>();
    db.setIntercept((c) => (c.table === 'events' ? late.promise : undefined));
    const ui = render(<ShareHarness shareId={share.id} />);
    fireEvent.press(ui.getByText('Append to current draft'));
    mockFocus.set(false);
    mockFocus.set(true);
    if (transition === 'cancel') fireEvent.press(ui.getByText('Cancel share'));
    if (transition === 'unmount') ui.unmount();
    if (transition === 'account') act(() => setMessageRecoveryAccount('other'));
    if (transition === 'membership') act(() => confirmMessageRecoveryMembership('user', null));
    await act(async () => late.resolve({ data: db.rows.events[0], error: null }));
    expect(share.entry.state.draft).toBe(
      transition === 'account' || transition === 'membership' ? '' : 'Keep draft',
    );
    expect(share.entry.state.attempt).toBeNull();
    if (transition === 'unmount') {
      db.setIntercept(null);
      const remount = render(<ShareHarness shareId={share.id} />);
      fireEvent.press(remount.getByText('Append to current draft'));
      await waitFor(() => expect(share.entry.state.draft).toBe(`Keep draft\n\n${share.text}`));
    }
  },
);
it('an old check cannot change a newer share review or its failed-send attempt', async () => {
  const entry = getMessageRecovery('channel', 'channel', 'user')!;
  editMessageDraft(entry, 'Failed text');
  await submitRecoveredMessage(
    entry,
    false,
    async () => ({ status: 'failed' }),
    () => 'fixed-id',
  );
  editMessageDraft(entry, 'Current draft');
  const attempt = entry.state.attempt;
  const first = await prepareChatShare(resource, 'channel', 'chapter', 'user', () => true);
  const second = await prepareChatShare(resource, 'channel', 'chapter', 'user', () => true);
  const old = deferred<Result>(),
    fresh = deferred<Result>();
  let reads = 0;
  db.setIntercept((c) =>
    c.table === 'events' ? (++reads === 1 ? old.promise : fresh.promise) : undefined,
  );
  const ui = render(<ShareHarness shareId={first.id} />);
  fireEvent.press(ui.getByText('Append to current draft'));
  await waitFor(() => expect(reads).toBe(1));
  mockFocus.set(false);
  mockFocus.set(true);
  ui.rerender(<ShareHarness shareId={second.id} />);
  fireEvent.press(ui.getByText('Append to current draft'));
  await waitFor(() => expect(reads).toBe(2));
  await act(async () => old.reject(new Error('old failure')));
  expect(
    ui.getByRole('button', { name: 'Append to current draft' }).props.accessibilityState.busy,
  ).toBe(true);
  expect(entry.state.attempt).toBe(attempt);
  await act(async () => fresh.resolve({ data: db.rows.events[0], error: null }));
  await waitFor(() => expect(entry.state.draft).toBe(`Current draft\n\n${second.text}`));
  expect(entry.state.attempt).toBe(attempt);
});
it.each(['ios', 'android'] as const)(
  'time-first %s entry survives reopen, dismissal, and date selection',
  (platform) => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: platform });
    const ui = render(<DateHarness />);
    fireEvent.press(ui.getByText('Start time: Choose time'));
    choose(new Date(2099, 0, 5, 19, 43));
    if (platform === 'ios') fireEvent.press(ui.getByText('Done'));
    fireEvent.press(ui.getByText('Start time: 19:43'));
    expect(picker().value.getHours()).toBe(19);
    expect(picker().value.getMinutes()).toBe(43);
    expect(JSON.parse(ui.getByTestId('values').props.children)).toEqual({
      date: '',
      time: '19:43',
    });
    choose(new Date(2001, 1, 1, 10, 5), 'dismissed');
    expect(JSON.parse(ui.getByTestId('values').props.children)).toEqual({
      date: '',
      time: '19:43',
    });
    fireEvent.press(ui.getByText('Start date: Choose date'));
    choose(new Date(2099, 0, 5, 12));
    expect(JSON.parse(ui.getByTestId('values').props.children)).toEqual({
      date: '2099-01-05',
      time: '19:43',
    });
  },
);
it.each(['ios', 'android'] as const)(
  'clear on %s closes a partially populated optional picker and rejects its delayed callbacks',
  (platform) => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: platform });
    const ui = render(
      <DateHarness
        label="End (optional)"
        optional
        initialTime="19:30"
        occurrence="stored-choice"
      />,
    );
    fireEvent.press(ui.getByText('End (optional) date: Choose date'));
    const callback = picker().onChange!;
    fireEvent.press(ui.getByText('Clear end time'));
    expect(ui.UNSAFE_queryByType(DateTimePicker)).toBeNull();
    act(() =>
      callback(
        { type: 'set', nativeEvent: { timestamp: 0, utcOffset: 0 } },
        new Date(2099, 0, 5, 12),
      ),
    );
    expect(JSON.parse(ui.getByTestId('values').props.children)).toEqual({ date: '', time: '' });
    expect(ui.queryByText('Clear end time')).toBeNull();
  },
);
it('required Start has no clear action; Done and dismissed pickers do not commit temporary defaults', () => {
  const ui = render(<DateHarness />);
  fireEvent.press(ui.getByText('Start date: Choose date'));
  fireEvent.press(ui.getByText('Done'));
  fireEvent.press(ui.getByText('Start time: Choose time'));
  choose(new Date(), 'dismissed');
  expect(JSON.parse(ui.getByTestId('values').props.children)).toEqual({ date: '', time: '' });
  expect(ui.queryByText('Clear end time')).toBeNull();
});
it('opening an unchanged picker retains the exact saved instant and closing it does not change fields', () => {
  const fields = timeHelpers.toLocalDateTimeFields(event.starts_at);
  const ui = render(
    <DateHarness initialDate={fields.date} initialTime={fields.time} original={event.starts_at} />,
  );
  fireEvent.press(ui.getByText(`Start time: ${fields.time}`));
  expect(picker().value.toISOString()).toBe(event.starts_at);
  fireEvent.press(ui.getByText('Done'));
  expect(JSON.parse(ui.getByTestId('values').props.children)).toEqual(fields);
});
function selectField(
  ui: ReturnType<typeof render>,
  label: string,
  mode: 'date' | 'time',
  value: Date,
) {
  fireEvent.press(
    ui.getByRole('button', { name: new RegExp(`^${label.replace(/[()]/g, '\\$&')} ${mode}:`) }),
  );
  choose(value);
  const done = ui.queryByText('Done');
  if (done) fireEvent.press(done);
}
it.each(['ios', 'android'] as const)(
  'actual create form on %s saves a cleared end as null without changing Start or other edits',
  async (platform) => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: platform });
    const ui = render(<NewEvent />);
    fireEvent.changeText(ui.getByPlaceholderText('Chapter meeting'), 'Keep title');
    fireEvent.changeText(ui.getByPlaceholderText('Chapter house'), 'Keep location');
    const start = new Date(2099, 0, 5, 18, 30);
    selectField(ui, 'Start', 'date', start);
    selectField(ui, 'Start', 'time', start);
    selectField(ui, 'End (optional)', 'date', new Date(2099, 0, 5, 20));
    selectField(ui, 'End (optional)', 'time', new Date(2099, 0, 5, 20));
    fireEvent.press(ui.getByText('Clear end time'));
    fireEvent.press(ui.getByText('Create event'));
    await waitFor(() => expect(createEvent).toHaveBeenCalledTimes(1));
    expect(createEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Keep title',
        location: 'Keep location',
        startsAt: start.toISOString(),
        endsAt: null,
      }),
    );
  },
);
it.each(['ios', 'android'] as const)(
  'actual edit form on %s removes a saved end and preserves exact start and unrelated edits',
  async (platform) => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: platform });
    const ui = render(<EditEvent />);
    await ui.findByText('Clear end time');
    fireEvent.changeText(ui.getByPlaceholderText('Chapter meeting'), 'Updated title');
    fireEvent.press(ui.getByText('Clear end time'));
    fireEvent.press(ui.getByText('Save changes'));
    await waitFor(() => expect(updateEvent).toHaveBeenCalledTimes(1));
    expect(updateEvent).toHaveBeenCalledWith(
      'event',
      expect.objectContaining({
        title: 'Updated title',
        starts_at: event.starts_at,
        ends_at: null,
        location: event.location,
        description: event.description,
      }),
    );
  },
);
it('a partial required Start still blocks create after clearing a partial End', () => {
  const ui = render(<NewEvent />);
  fireEvent.changeText(ui.getByPlaceholderText('Chapter meeting'), 'Dinner');
  selectField(ui, 'Start', 'date', new Date(2099, 0, 5, 18));
  selectField(ui, 'End (optional)', 'time', new Date(2099, 0, 5, 20));
  fireEvent.press(ui.getByText('Clear end time'));
  fireEvent.press(ui.getByText('Create event'));
  expect(ui.getByText(/Choose a valid local date and time/)).toBeTruthy();
  expect(createEvent).not.toHaveBeenCalled();
});
it('the actual native form retains its device-timezone-change guard after clearing End', async () => {
  const zone = jest.spyOn(timeHelpers, 'localTimeZone').mockReturnValue('Original/Zone');
  const ui = render(<EditEvent />);
  await ui.findByText('Clear end time');
  fireEvent.press(ui.getByText('Clear end time'));
  zone.mockReturnValue('Changed/Zone');
  fireEvent.press(ui.getByText('Save changes'));
  expect(ui.getByText(/Your device timezone changed/)).toBeTruthy();
  expect(updateEvent).not.toHaveBeenCalled();
});
