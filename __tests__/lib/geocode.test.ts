import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { coordsRoughlyEqual, geocodeCity } from '../../lib/geocode';

const ORIGINAL_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN;
const ORIGINAL_FETCH = global.fetch;

/** Minimal Response-shaped object — geocodeCity only reads ok/json(). */
function jsonResponse(body: unknown, ok = true) {
  return { ok, json: async () => body } as Response;
}

function mockFetch(impl: (...args: Parameters<typeof fetch>) => Promise<Response>) {
  const mock = jest.fn(impl);
  global.fetch = mock as unknown as typeof fetch;
  return mock;
}

describe('geocodeCity', () => {
  beforeEach(() => {
    process.env.EXPO_PUBLIC_MAPBOX_TOKEN = 'pk.test-token';
  });

  afterEach(() => {
    if (ORIGINAL_TOKEN === undefined) delete process.env.EXPO_PUBLIC_MAPBOX_TOKEN;
    else process.env.EXPO_PUBLIC_MAPBOX_TOKEN = ORIGINAL_TOKEN;
    global.fetch = ORIGINAL_FETCH;
    jest.restoreAllMocks();
  });

  it('returns null without fetching when the token is missing', async () => {
    delete process.env.EXPO_PUBLIC_MAPBOX_TOKEN;
    const fetchMock = mockFetch(async () => jsonResponse({}));

    await expect(geocodeCity('Austin, TX')).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns null without fetching when the token is empty', async () => {
    process.env.EXPO_PUBLIC_MAPBOX_TOKEN = '';
    const fetchMock = mockFetch(async () => jsonResponse({}));

    await expect(geocodeCity('Austin, TX')).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns null without fetching for an empty city', async () => {
    const fetchMock = mockFetch(async () => jsonResponse({}));

    await expect(geocodeCity('')).resolves.toBeNull();
    await expect(geocodeCity('   ')).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('parses features[0].geometry.coordinates as [lng, lat]', async () => {
    const fetchMock = mockFetch(async () =>
      jsonResponse({
        features: [{ geometry: { coordinates: [-97.7431, 30.2672] } }],
      }),
    );

    const coords = await geocodeCity('Austin, TX');
    expect(coords).toEqual({ lat: 30.2672, lng: -97.7431 });

    // The request hits the v6 forward endpoint with the encoded query + token.
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain('https://api.mapbox.com/search/geocode/v6/forward');
    expect(url).toContain(`q=${encodeURIComponent('Austin, TX')}`);
    expect(url).toContain('types=place');
    expect(url).toContain('limit=1');
    expect(url).toContain('access_token=pk.test-token');
  });

  it('returns null on a non-200 response', async () => {
    mockFetch(async () => jsonResponse({ message: 'Unauthorized' }, false));
    await expect(geocodeCity('Austin, TX')).resolves.toBeNull();
  });

  it('returns null when the network request rejects', async () => {
    mockFetch(async () => {
      throw new Error('Network request failed');
    });
    await expect(geocodeCity('Austin, TX')).resolves.toBeNull();
  });

  it('returns null when there are no features', async () => {
    mockFetch(async () => jsonResponse({ features: [] }));
    await expect(geocodeCity('Nowheresville')).resolves.toBeNull();
  });

  it('returns null when the body is malformed', async () => {
    mockFetch(async () => jsonResponse({ features: [{ geometry: {} }] }));
    await expect(geocodeCity('Austin, TX')).resolves.toBeNull();

    mockFetch(async () => jsonResponse({}));
    await expect(geocodeCity('Austin, TX')).resolves.toBeNull();

    mockFetch(async () => jsonResponse({ features: [{ geometry: { coordinates: ['x'] } }] }));
    await expect(geocodeCity('Austin, TX')).resolves.toBeNull();
  });

  it('returns null when json() itself throws', async () => {
    mockFetch(async () => ({
      ok: true,
      json: async () => {
        throw new Error('invalid json');
      },
    }) as unknown as Response);
    await expect(geocodeCity('Austin, TX')).resolves.toBeNull();
  });
});

describe('coordsRoughlyEqual', () => {
  it('is true for identical coordinates', () => {
    expect(
      coordsRoughlyEqual({ lat: 30.2672, lng: -97.7431 }, { lat: 30.2672, lng: -97.7431 }),
    ).toBe(true);
  });

  it('is true within the default epsilon', () => {
    expect(
      coordsRoughlyEqual(
        { lat: 30.2672, lng: -97.7431 },
        { lat: 30.2672 + 1e-7, lng: -97.7431 - 1e-7 },
      ),
    ).toBe(true);
  });

  it('is false outside epsilon', () => {
    expect(
      coordsRoughlyEqual({ lat: 30.2672, lng: -97.7431 }, { lat: 30.28, lng: -97.7431 }),
    ).toBe(false);
  });

  it('respects a custom epsilon', () => {
    expect(
      coordsRoughlyEqual({ lat: 30, lng: -97 }, { lat: 30.4, lng: -97.4 }, 0.5),
    ).toBe(true);
  });
});
