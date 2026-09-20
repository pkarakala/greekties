/**
 * Shareable links for the app.
 *
 * Invite links are HTTPS web links so they work for people WITHOUT the app:
 * the Expo web build deployed to GitHub Pages resolves /join/<code> with
 * expo-router (same route file as native). The custom scheme
 * greekties://join/<code> still works as a secondary path for people who
 * already have the app installed — see docs/UNIVERSAL_LINKS.md for the
 * true universal-links upgrade path.
 */

export const WEB_BASE_URL = 'https://pkarakala.github.io/greekties';

/** Accept only our supported links or a bounded, path-safe raw code. */
export function parseInviteCode(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  let value = input.trim();
  if (value.includes('://')) {
    try {
      const url = new URL(value);
      if (url.username || url.password || url.port) return null;
      const path =
        url.protocol === 'greekties:' && url.hostname === 'join'
          ? url.pathname
          : url.protocol === 'https:' &&
              url.origin === new URL(WEB_BASE_URL).origin &&
              url.pathname.startsWith('/greekties/join/')
            ? url.pathname.slice('/greekties/join'.length)
            : null;
      if (!path || !/^\/[^/]+\/?$/.test(path)) return null;
      value = decodeURIComponent(path.replace(/^\//, '').replace(/\/$/, ''));
    } catch {
      return null;
    }
  }
  return /^[a-z0-9_-]{1,128}$/i.test(value) ? value.toLowerCase() : null;
}

/** Web invite link for a chapter invite code — works with or without the app. */
export function joinLink(code: string): string {
  // Codes are alphanumeric today, but encode defensively so a code with
  // reserved characters can't break the path or smuggle extra segments.
  return `${WEB_BASE_URL}/join/${encodeURIComponent(code)}`;
}

/** Friendly share copy for an invite: web link first, native scheme as a hint. */
export function joinMessage(code: string, chapterName?: string | null): string {
  const target = chapterName ? `${chapterName} on Greek Ties` : 'our chapter on Greek Ties';
  return `Join ${target}: ${joinLink(code)}\n\nHave the app? Open greekties://join/${encodeURIComponent(code)}`;
}
