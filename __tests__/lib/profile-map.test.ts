import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { saveProfileWithMap } from '../../lib/profile';
import { geocodeCity } from '../../lib/geocode';
import { supabase } from '../../lib/supabase';
import { hasMapLocation } from '../../lib/map-consent';
import type { Profile } from '../../lib/types';

jest.mock('../../lib/supabase', () => ({ supabase: { from: jest.fn(), rpc: jest.fn() } }));
jest.mock('../../lib/geocode', () => ({ geocodeCity: jest.fn() }));
jest.mock('expo-image-manipulator', () => ({}));
const rpc = jest.mocked(supabase.rpc) as jest.Mock<any>;
const lookup = jest.mocked(geocodeCity);
const update = jest.fn<any>();
const persisted = jest.fn<any>();
const profile = {
  id: 'p',
  city: 'Old city',
  map_sharing_enabled: true,
  map_revision: 'old',
  status: 'approved',
  membership_type: 'alumni',
  lat: 30,
  lng: -97,
} as Profile;

beforeEach(() => {
  jest.clearAllMocks();
  persisted.mockResolvedValue({ data: { id: 'p' }, error: null });
  update.mockReturnValue({ eq: () => ({ select: () => ({ single: persisted }) }) });
  jest.mocked(supabase.from).mockReturnValue({ update } as any);
  rpc.mockImplementation(async (name: string) => ({
    data: name === 'set_profile_map_sharing' ? 'new' : 'completed',
    error: null,
  }));
  lookup.mockResolvedValue({ lat: 40, lng: -80 });
});

describe('durable consent save', () => {
  it('saves a city with sharing off without lookup or direct coordinate writes', async () => {
    expect(
      await saveProfileWithMap(profile, { name: 'Updated' }, ' New city ', false),
    ).toMatchObject({ error: null });
    expect(lookup).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('set_profile_map_sharing', {
      target_profile_id: 'p',
      expected_revision: 'old',
      profile_city: 'New city',
      sharing_enabled: false,
    });
    expect(update).toHaveBeenCalledWith({ name: 'Updated' });
  });
  it('clears the old pin before lookup, then completes only the returned revision', async () => {
    lookup.mockImplementation(async () => {
      expect(rpc).toHaveBeenCalledTimes(1);
      expect(persisted).toHaveBeenCalled();
      return { lat: 40, lng: -80 };
    });
    expect(await saveProfileWithMap(profile, {}, 'New city', true)).toMatchObject({ error: null });
    expect(rpc).toHaveBeenLastCalledWith('complete_profile_map_location', {
      target_profile_id: 'p',
      expected_revision: 'new',
      latitude: 40,
      longitude: -80,
    });
  });
  it('clearing city also disables sharing and performs no lookup', async () => {
    await saveProfileWithMap(profile, {}, ' ', true);
    expect(rpc.mock.calls[0][1]).toMatchObject({ profile_city: null, sharing_enabled: false });
    expect(lookup).not.toHaveBeenCalled();
  });
  it('retains active designation and consent intent without creating a pin', async () => {
    await saveProfileWithMap({ ...profile, membership_type: 'active' }, {}, 'Austin', true);
    expect(lookup).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith({});
  });
  it('saves other edits and reports lookup failure without restoring old coordinates', async () => {
    lookup.mockResolvedValue(null);
    const result = await saveProfileWithMap(profile, { bio: 'Changed' }, 'New city', true);
    expect(result.error).toContain('Your pin is removed');
    expect(update).toHaveBeenCalledWith({ bio: 'Changed' });
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it.each([{}, { map_sharing_enabled: false }])(
    'fails closed for missing consent support %j',
    async (overrides) => {
      const legacy = { ...profile, map_revision: undefined, ...overrides };
      const result = await saveProfileWithMap(legacy, { bio: 'Saved' }, 'City', true);
      expect(result.error).toContain('privacy controls are unavailable');
      expect(update).toHaveBeenCalledWith({ bio: 'Saved' });
      expect(rpc).not.toHaveBeenCalled();
      expect(lookup).not.toHaveBeenCalled();
    },
  );
  it.each(['error', 'throw', 'missing'])(
    'does not look up after failed consent persistence: %s',
    async (mode) => {
      if (mode === 'throw') rpc.mockRejectedValue(new Error('offline'));
      else
        rpc.mockResolvedValue({
          data: null,
          error: mode === 'error' ? { message: 'missing RPC' } : null,
        });
      expect((await saveProfileWithMap(profile, { bio: 'Saved' }, 'New', true)).error).toContain(
        'previous map setting may still be in effect',
      );
      expect(lookup).not.toHaveBeenCalled();
      expect(update).toHaveBeenCalledWith({ bio: 'Saved' });
    },
  );
  it('reports ordinary profile write failure and leaves the cleared pin alone', async () => {
    persisted.mockResolvedValue({ data: null, error: { message: 'offline' } });
    expect((await saveProfileWithMap(profile, {}, 'New', true)).error).toContain(
      'Other profile edits could not be saved',
    );
    expect(lookup).not.toHaveBeenCalled();
  });
  it('treats zero-row profile writes as failure', async () => {
    persisted.mockResolvedValue({ data: null, error: null });
    expect((await saveProfileWithMap(profile, {}, 'New', false)).error).toContain(
      'could not be saved',
    );
  });
  it('suppresses late lookup after the form is abandoned', async () => {
    let current = true;
    let finish!: (value: { lat: number; lng: number }) => void;
    lookup.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const save = saveProfileWithMap(profile, {}, 'New', true, () => current);
    for (let i = 0; i < 10 && !finish; i++) await Promise.resolve();
    current = false;
    finish({ lat: 40, lng: -80 });
    await save;
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it.each([false, null])(
    'reports stale or failed final persistence (%s), never retries with a newer revision',
    async (data) => {
      rpc.mockImplementation(async (name: string) => ({
        data: name === 'set_profile_map_sharing' ? 'new' : data,
        error: null,
      }));
      expect((await saveProfileWithMap(profile, {}, 'New', true)).error).toContain(
        'map update could not be confirmed',
      );
      expect(rpc).toHaveBeenCalledTimes(2);
    },
  );
});

describe('both pin paths fail closed', () => {
  it('accepts only an explicitly consenting approved alumnus with valid coordinates', () => {
    expect(hasMapLocation(profile)).toBe(true);
    expect(
      hasMapLocation(
        JSON.parse(
          JSON.stringify({ ...profile, map_sharing_enabled: false, lat: null, lng: null }),
        ),
      ),
    ).toBe(false);
  });
  it.each([
    { map_sharing_enabled: undefined },
    { map_sharing_enabled: false },
    { membership_type: 'active' },
    { status: 'rejected' },
    { status: 'pending' },
    { city: null },
    { lat: null },
    { lng: null },
    { lat: NaN },
    { lat: 91 },
    { lng: -181 },
  ])('rejects legacy, revoked, ineligible or malformed map state %j', (overrides) => {
    expect(hasMapLocation({ ...profile, ...overrides } as Profile)).toBe(false);
  });
});
