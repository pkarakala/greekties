// Forward-geocode a city name to coordinates via Mapbox Geocoding v6.
// Used on profile save so the alumni map can place a pin for the member.
//
// Deliberately best-effort: geocoding must NEVER block or fail a profile
// save, so every failure path (missing token, network error, non-200,
// no results, timeout) resolves to null instead of throwing.

const GEOCODE_ENDPOINT = 'https://api.mapbox.com/search/geocode/v6/forward';
const TIMEOUT_MS = 5000;

export interface Coordinates {
  lat: number;
  lng: number;
}

/**
 * Resolve a city name ("Austin, TX") to { lat, lng }, or null when it can't.
 * Reads EXPO_PUBLIC_MAPBOX_TOKEN at call time; a missing/placeholder token
 * short-circuits to null without a network request. Never throws.
 */
export async function geocodeCity(city: string): Promise<Coordinates | null> {
  const query = city?.trim();
  if (!query) return null;

  const token = process.env.EXPO_PUBLIC_MAPBOX_TOKEN;
  if (!token || token.startsWith('PASTE_')) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const url =
      `${GEOCODE_ENDPOINT}?q=${encodeURIComponent(query)}` +
      `&types=place&limit=1&access_token=${encodeURIComponent(token)}`;
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return null;

    const body = (await response.json()) as {
      features?: { geometry?: { coordinates?: number[] } }[];
    };
    const coordinates = body?.features?.[0]?.geometry?.coordinates;
    if (!Array.isArray(coordinates) || coordinates.length < 2) return null;

    // Mapbox returns GeoJSON order: [lng, lat].
    const [lng, lat] = coordinates;
    if (typeof lng !== 'number' || typeof lat !== 'number') return null;
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;

    return { lat, lng };
  } catch {
    // Network failure, abort/timeout, or malformed JSON — the save goes on.
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** True when two coordinate pairs are within epsilon on both axes. */
export function coordsRoughlyEqual(
  a: Coordinates,
  b: Coordinates,
  epsilon = 1e-6,
): boolean {
  return Math.abs(a.lat - b.lat) <= epsilon && Math.abs(a.lng - b.lng) <= epsilon;
}
