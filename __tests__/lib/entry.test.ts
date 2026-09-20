import { describe, expect, it } from '@jest/globals';
import { membershipState, canRenderRoute, type MembershipState } from '../../lib/entry';
import type { Profile } from '../../lib/types';

const profile = (status: string) => ({ status, chapter_id: 'a' }) as Profile;
describe('membership routing', () => {
  it('separates auth/profile loading, failure and a confirmed missing profile', () => {
    expect(membershipState(true, true, 'ready', profile('approved'), null)).toBe('loading');
    expect(membershipState(false, true, 'loading', null, null)).toBe('loading');
    expect(membershipState(false, true, 'error', null, null)).toBe('error');
    expect(membershipState(false, true, 'missing', null, null)).toBe('missing');
    expect(membershipState(false, false, 'ready', profile('approved'), null)).toBe('signed-out');
    expect(membershipState(false, false, 'missing', null, 'restore failed')).toBe('error');
  });
  it.each([
    ['approved', 'approved'],
    ['pending', 'pending'],
    ['rejected', 'removed'],
    ['unknown', 'error'],
  ])('maps %s to %s', (status, expected) => {
    expect(membershipState(false, true, 'ready', profile(status), null)).toBe(expected);
  });
  it.each<MembershipState>(['loading', 'error', 'signed-out', 'missing', 'pending', 'removed'])(
    'does not mount protected content for %s, but keeps recovery reachable',
    (state) => {
      for (const route of [
        '(tabs)',
        'admin/members',
        'profile/edit',
        'onboarding/complete-profile',
        'inbox/[requestId]',
      ]) {
        expect(canRenderRoute(route, state)).toBe(false);
      }
      for (const route of [
        'reset-password',
        'forgot-password',
        'join/[code]',
        'onboarding/enter-code',
        'membership',
      ]) {
        expect(canRenderRoute(route, state)).toBe(true);
      }
    },
  );
});
