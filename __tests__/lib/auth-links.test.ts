import { describe, expect, it } from '@jest/globals';
import { parseRecoveryLink } from '../../lib/auth-links';

describe('password recovery links', () => {
  it.each(['greekties://reset-password', 'https://pkarakala.github.io/greekties/reset-password'])(
    'accepts implicit and PKCE callbacks for %s',
    (base) => {
      expect(parseRecoveryLink(`${base}#access_token=a&refresh_token=r&type=recovery`)).toEqual({
        access_token: 'a',
        refresh_token: 'r',
      });
      expect(parseRecoveryLink(`${base}?code=once`)).toEqual({ code: 'once' });
    },
  );
  it.each([
    'https://evil.test/reset-password?code=a',
    'greekties://join/a?code=a',
    'greekties://reset-password#access_token=partial',
    'bad',
  ])('rejects %s', (link) => {
    expect(parseRecoveryLink(link)).toBeNull();
  });
});
