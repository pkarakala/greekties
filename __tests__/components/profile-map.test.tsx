import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import EditProfileScreen from '../../app/profile/edit';
import CompleteProfileScreen from '../../app/onboarding/complete-profile';
import { useAuth } from '../../lib/auth';
import { saveProfileWithMap } from '../../lib/profile';
import { useRouter } from 'expo-router';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('../../components/Avatar', () => ({ Avatar: () => null }));
jest.mock('../../lib/auth', () => ({ useAuth: jest.fn() }));
jest.mock('../../lib/profile', () => ({ saveProfileWithMap: jest.fn(), uploadAvatar: jest.fn() }));
jest.mock('expo-image-picker', () => ({}));
jest.mock('expo-router', () => ({ useRouter: jest.fn() }));
jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual<any>('react-native-safe-area-context/jest/mock').default,
);
const back = jest.fn(),
  replace = jest.fn(),
  refresh = jest.fn<() => Promise<void>>();
let profile: any;
beforeEach(() => {
  jest.clearAllMocks();
  profile = {
    id: 'p',
    user_id: 'u',
    city: 'Austin',
    lat: 30,
    lng: -97,
    membership_type: 'alumni',
    status: 'approved',
    map_sharing_enabled: false,
    map_revision: 'r1',
  };
  refresh.mockResolvedValue(undefined);
  jest
    .mocked(useAuth)
    .mockImplementation(
      () => ({ profile, refreshProfile: refresh, session: { user: { id: 'u' } } }) as any,
    );
  jest.mocked(useRouter).mockReturnValue({ back, replace } as any);
  jest.mocked(saveProfileWithMap).mockResolvedValue({ error: null });
});

describe.each([
  ['edit', EditProfileScreen],
  ['onboarding', CompleteProfileScreen],
] as [string, typeof EditProfileScreen][])('%s consent form', (_name, Screen) => {
  it('defaults legacy coordinates off and explains profile city visibility', () => {
    delete profile.map_sharing_enabled;
    delete profile.map_revision;
    const ui = render(<Screen />);
    expect(ui.getByLabelText('Share my city on the alumni map').props.value).toBe(false);
    expect(ui.getByLabelText('Share my city on the alumni map').props.disabled).toBe(true);
    expect(ui.getByText(/City is optional and visible in your chapter profile/)).toBeTruthy();
  });
  it('persists explicit opt-in with the optional city, then refreshes', async () => {
    const ui = render(<Screen />);
    fireEvent(ui.getByLabelText('Share my city on the alumni map'), 'valueChange', true);
    fireEvent.changeText(ui.getByLabelText('City (optional)'), 'Chicago');
    fireEvent.press(ui.getByText('Save'));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(saveProfileWithMap).toHaveBeenCalledWith(
      profile,
      expect.not.objectContaining({ lat: expect.anything() }),
      'Chicago',
      true,
      expect.any(Function),
    );
  });
  it('opt-out preserves city and reloads off on reopening', async () => {
    profile.map_sharing_enabled = true;
    const ui = render(<Screen />);
    fireEvent(ui.getByLabelText('Share my city on the alumni map'), 'valueChange', false);
    fireEvent.press(ui.getByText('Save'));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(jest.mocked(saveProfileWithMap).mock.calls[0].slice(2, 4)).toEqual(['Austin', false]);
    ui.unmount();
    profile = { ...profile, map_sharing_enabled: false, lat: null, lng: null };
    const reopened = render(<Screen />);
    expect(reopened.getByLabelText('Share my city on the alumni map').props.value).toBe(false);
    expect(reopened.getByLabelText('City (optional)').props.value).toBe('Austin');
  });
  it('keeps recoverable failure feedback on screen after refreshing the actual saved state', async () => {
    jest
      .mocked(saveProfileWithMap)
      .mockResolvedValue({ error: 'Profile saved. Your pin is removed. Retry lookup.' });
    const ui = render(<Screen />);
    fireEvent.press(ui.getByText('Save'));
    await waitFor(() => expect(ui.getByText(/Your pin is removed/)).toBeTruthy());
    expect(back).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
    expect(ui.getByLabelText('City (optional)').props.value).toBe('Austin');
  });
  it('serializes city and consent changes during save and cancels late lookup completion on unmount', async () => {
    let finish!: (value: { error: null }) => void;
    jest.mocked(saveProfileWithMap).mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const ui = render(<Screen />);
    fireEvent.press(ui.getByText('Save'));
    expect(ui.getByLabelText('City (optional)').props.editable).toBe(false);
    expect(ui.getByLabelText('Share my city on the alumni map').props.disabled).toBe(true);
    fireEvent.press(ui.getByText('Save'));
    expect(saveProfileWithMap).toHaveBeenCalledTimes(1);
    const isCurrent = jest.mocked(saveProfileWithMap).mock.calls[0][4]!;
    expect(isCurrent()).toBe(true);
    ui.unmount();
    expect(isCurrent()).toBe(false);
    await act(async () => {
      finish({ error: null });
    });
    expect(back).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });
});

it('allows onboarding to be skipped with no location or map write', () => {
  const ui = render(<CompleteProfileScreen />);
  fireEvent.press(ui.getByText('Skip for now'));
  expect(replace).toHaveBeenCalledWith('/');
  expect(saveProfileWithMap).not.toHaveBeenCalled();
});

it('a background refresh cannot attach stale consent to a newer opt-out revision', async () => {
  profile.map_sharing_enabled = true;
  const ui = render(<EditProfileScreen />);
  profile = {
    ...profile,
    map_sharing_enabled: false,
    map_revision: 'external-opt-out',
    lat: null,
    lng: null,
  };
  ui.rerender(<EditProfileScreen />);
  fireEvent.press(ui.getByText('Save'));
  await waitFor(() => expect(refresh).toHaveBeenCalled());
  expect(jest.mocked(saveProfileWithMap).mock.calls[0][0].map_revision).toBe('r1');
});

it('lookup retry uses the revision saved by this form even after auth refresh', async () => {
  jest
    .mocked(saveProfileWithMap)
    .mockResolvedValue({ error: 'Lookup unavailable; pin removed.', revision: 'our-save' });
  const ui = render(<EditProfileScreen />);
  fireEvent.press(ui.getByText('Save'));
  await waitFor(() => expect(ui.getByText(/Lookup unavailable/)).toBeTruthy());
  profile = { ...profile, map_revision: 'our-save' };
  ui.rerender(<EditProfileScreen />);
  fireEvent.press(ui.getByText('Save'));
  await waitFor(() => expect(saveProfileWithMap).toHaveBeenCalledTimes(2));
  expect(jest.mocked(saveProfileWithMap).mock.calls[1][0].map_revision).toBe('our-save');
});
