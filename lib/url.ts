import { Alert, Linking } from 'react-native';

/**
 * Normalize a user-supplied link to a safe http(s) URL, or null.
 * Blocks javascript:, data:, file:, and other scheme abuse — user-entered
 * URLs (LinkedIn profiles, job apply links) must never open arbitrary schemes.
 */
export function sanitizeHttpUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  // Bare domains ("linkedin.com/in/x") get https:// prepended.
  const candidate = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    return parsed.href;
  } catch {
    return null;
  }
}

/** Open a user-supplied URL, alerting instead of opening anything non-http(s). */
export async function openExternalUrl(url: string | null | undefined): Promise<void> {
  const safe = sanitizeHttpUrl(url);
  if (!safe) {
    Alert.alert('Can’t open this link', 'The link is missing or not a valid web address.');
    return;
  }
  try {
    await Linking.openURL(safe);
  } catch {
    Alert.alert('Can’t open this link', 'Something went wrong opening the link.');
  }
}
