import { beforeEach, expect, it, jest } from '@jest/globals';
import { render, fireEvent } from '@testing-library/react-native';
import Notifications from '@/app/notifications';
import { useNotifications } from '@/lib/inbox-notifications';
jest.mock('@/lib/auth', () => ({
  useAuth: () => ({ session: { user: { id: 'me' } }, blockedIds: new Set() }),
}));
jest.mock('@/lib/inbox-notifications', () => ({ useNotifications: jest.fn() }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, back: jest.fn() }) }));
jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual<any>('react-native-safe-area-context/jest/mock').default,
);
const mockPush = jest.fn(),
  reload = jest.fn(),
  markRead = jest.fn(async () => {});
const base = {
  loading: false,
  error: null,
  notifications: [],
  unreadCount: 0,
  reload,
  markRead,
  markAllRead: jest.fn(async () => {}),
};
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useNotifications).mockReturnValue(base);
});
it('offers explicit retry, avoids false empty content, and recovers to genuine empty', () => {
  jest
    .mocked(useNotifications)
    .mockReturnValue({ ...base, error: 'Couldn’t load notifications. Pull to refresh.' });
  const ui = render(<Notifications />);
  expect(ui.getByRole('alert')).toBeTruthy();
  expect(ui.queryByText('Nothing yet. We’ll let you know.')).toBeNull();
  fireEvent.press(ui.getByRole('button', { name: 'Retry notifications' }));
  expect(reload).toHaveBeenCalledTimes(1);
  jest.mocked(useNotifications).mockReturnValue({ ...base, loading: true, error: 'offline' });
  ui.rerender(<Notifications />);
  expect(
    ui.getByRole('button', { name: 'Retry notifications' }).props.accessibilityState.disabled,
  ).toBe(true);
  jest.mocked(useNotifications).mockReturnValue(base);
  ui.rerender(<Notifications />);
  expect(ui.getByText('Nothing yet. We’ll let you know.')).toBeTruthy();
  expect(ui.queryByRole('alert')).toBeNull();
});
it('shows source errors alongside any retained rows and preserves safe notification navigation', () => {
  const notification = {
    id: 'n',
    title: 'Career night',
    url: '/events/event-a',
    created_at: '2026-10-13T00:00:00Z',
    read: false,
  } as any;
  jest
    .mocked(useNotifications)
    .mockReturnValue({ ...base, error: 'offline', notifications: [notification], unreadCount: 1 });
  const ui = render(<Notifications />);
  expect(ui.getByRole('alert')).toBeTruthy();
  fireEvent.press(ui.getByRole('button', { name: 'Career night' }));
  expect(markRead).toHaveBeenCalledWith('n');
  expect(mockPush).toHaveBeenCalledWith('/events/event-a');
});
it('blocks external and protocol-relative destinations without blocking mark-read', () => {
  jest.mocked(useNotifications).mockReturnValue({
    ...base,
    notifications: [
      {
        id: 'n',
        title: 'Unsafe',
        url: '//external.invalid',
        created_at: '2026-10-13T00:00:00Z',
      } as any,
    ],
  });
  const ui = render(<Notifications />);
  fireEvent.press(ui.getByRole('button', { name: 'Unsafe' }));
  expect(markRead).toHaveBeenCalledWith('n');
  expect(mockPush).not.toHaveBeenCalled();
});
