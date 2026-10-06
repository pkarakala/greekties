import { WEB_BASE_URL } from './links';

export type RecoveryCredentials =
  { access_token: string; refresh_token: string } | { code: string };
/** Parse only our password-recovery route; never log credential-bearing URLs. */
export function parseRecoveryLink(input: string): RecoveryCredentials | null {
  try {
    const url = new URL(input);
    const valid =
      (url.protocol === 'greekties:' &&
        url.hostname === 'reset-password' &&
        /^\/?$/.test(url.pathname)) ||
      (url.protocol === 'https:' &&
        `${url.origin}${url.pathname}` === `${WEB_BASE_URL}/reset-password`);
    if (!valid || url.username || url.password) return null;
    const params = new URLSearchParams(url.hash ? url.hash.slice(1) : url.search);
    const access_token = params.get('access_token'),
      refresh_token = params.get('refresh_token');
    if (access_token && refresh_token) return { access_token, refresh_token };
    const code = params.get('code');
    return code ? { code } : null;
  } catch {
    return null;
  }
}
