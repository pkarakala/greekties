import { beforeEach, expect, it, jest } from '@jest/globals';
import { render } from '@testing-library/react-native';
import { useAuth } from '../../lib/auth';
import { useMapMembers } from '../../lib/queries';

jest.mock('../../lib/auth', () => ({ useAuth: jest.fn() }));
jest.mock('../../lib/queries', () => ({ useMapMembers: jest.fn() }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn() }),
  useFocusEffect: jest.fn(),
}));
jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual<any>('react-native-safe-area-context/jest/mock').default,
);
jest.mock('@rnmapbox/maps', () => {
  const { View } = jest.requireActual<any>('react-native');
  const React = jest.requireActual<any>('react');
  return {
    default: {
      setAccessToken: jest.fn(),
      StyleURL: { Light: 'light' },
      MapView: ({ children }: any) => children,
      Camera: () => null,
      PointAnnotation: ({ id }: any) => React.createElement(View, { testID: `pin-${id}` }),
    },
  };
});
const previousToken = process.env.EXPO_PUBLIC_MAPBOX_TOKEN;
process.env.EXPO_PUBLIC_MAPBOX_TOKEN = 'pk.test-only';
// Load only after setting a fake token; this suite never contacts Mapbox.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const MapScreen = require('../../app/map').default;
if (previousToken === undefined) delete process.env.EXPO_PUBLIC_MAPBOX_TOKEN;
else process.env.EXPO_PUBLIC_MAPBOX_TOKEN = previousToken;
const self = {
  id: 'self',
  city: 'Austin',
  map_sharing_enabled: true,
  membership_type: 'alumni',
  status: 'approved',
  lat: 30,
  lng: -97,
};
let profile: any;
let query: any;
beforeEach(() => {
  profile = { ...self };
  query = { members: [{ ...self, id: 'peer' }], loading: false, error: null, reload: jest.fn() };
  jest.mocked(useAuth).mockImplementation(() => ({ profile, blockedIds: new Set() }) as any);
  jest.mocked(useMapMembers).mockImplementation(() => query);
});
it('renders both consenting alumni pin paths', () => {
  const ui = render(<MapScreen />);
  expect(ui.getByTestId('pin-self')).toBeTruthy();
  expect(ui.getByTestId('pin-peer')).toBeTruthy();
});
it('removes self on opt-out even when the peer query still contains an older self row', () => {
  query.members.push(self);
  const ui = render(<MapScreen />);
  profile = { ...self, map_sharing_enabled: false };
  ui.rerender(<MapScreen />);
  expect(ui.queryByTestId('pin-self')).toBeNull();
  expect(ui.getByTestId('pin-peer')).toBeTruthy();
});
it('legacy coordinates and active designation never produce either pin', () => {
  profile = { ...self, map_sharing_enabled: undefined };
  query.members = [{ ...self, id: 'peer', membership_type: 'active' }];
  const ui = render(<MapScreen />);
  expect(ui.queryByTestId('pin-self')).toBeNull();
  expect(ui.queryByTestId('pin-peer')).toBeNull();
});
it('hides the separate self pin when consent API is unavailable', () => {
  query = { ...query, members: [], error: 'Map sharing unavailable' };
  const ui = render(<MapScreen />);
  expect(ui.queryByTestId('pin-self')).toBeNull();
});
