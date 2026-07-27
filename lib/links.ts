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
