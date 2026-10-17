import { beforeEach, expect, it, jest } from '@jest/globals';
import { fireEvent, render } from '@testing-library/react-native';
import Requests from '@/app/inbox/index';
import { useInbox } from '@/lib/mentorship';

jest.mock('@/lib/auth', () => ({
  useAuth: () => ({ session: { user: { id: 'me' } }, blockedIds: new Set() }),
}));
jest.mock('@/lib/mentorship', () => ({ useInbox: jest.fn() }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, back: jest.fn() }) }));
jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual<any>('react-native-safe-area-context/jest/mock').default,
);
const mockPush = jest.fn(),
  reload = jest.fn();
let inbox: any;
beforeEach(() => {
  jest.clearAllMocks();
  inbox = {
    loading: false,
    error: null,
    incoming: [
      {
        id: 'pending',
        from_user_id: 'peer',
        to_user_id: 'me',
        status: 'pending',
        message: 'I would value advice on my first internship.',
      },
    ],
    outgoing: [
      {
        id: 'accepted',
        from_user_id: 'me',
        to_user_id: 'mentor',
        status: 'accepted',
        message: 'Career guidance',
      },
    ],
    profiles: {
      peer: { name: 'Alexandra Jordan Taylor Nguyen' },
      mentor: { name: 'Christopher Morgan Rivera' },
    },
    reload,
  };
  jest.mocked(useInbox).mockImplementation(() => inbox);
});
it('keeps distinct request statuses and opens the existing request detail rather than a new DM', () => {
  const ui = render(<Requests />);
  expect(ui.getByText('pending')).toBeTruthy();
  expect(ui.getByText('accepted')).toBeTruthy();
  fireEvent.press(
    ui.getByRole('button', { name: /Alexandra Jordan Taylor Nguyen, pending mentorship request/ }),
  );
  expect(mockPush).toHaveBeenCalledWith({
    pathname: '/inbox/[requestId]',
    params: { requestId: 'pending' },
  });
  expect(ui.queryByLabelText('Message draft')).toBeNull();
});
it('keeps failed requests distinct from an empty list and exposes read-only Retry', () => {
  inbox = { ...inbox, incoming: [], outgoing: [], error: 'Offline' };
  const ui = render(<Requests />);
  expect(ui.queryByText(/No mentorship requests yet/)).toBeNull();
  expect(ui.getByRole('alert')).toBeTruthy();
  fireEvent.press(ui.getByRole('button', { name: 'Retry requests' }));
  expect(reload).toHaveBeenCalledTimes(1);
});
it('names the loading state without displaying a false empty result', () => {
  inbox = { ...inbox, loading: true, incoming: [], outgoing: [] };
  const ui = render(<Requests />);
  expect(ui.getByLabelText('Loading requests')).toBeTruthy();
  expect(ui.queryByText(/No mentorship requests yet/)).toBeNull();
});
