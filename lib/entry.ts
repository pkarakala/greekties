import type { Profile } from './types';

/** A successful prior read can be retained only for this exact account. */
export function isApprovedProfileForUser(profile: Profile | null, userId?: string): boolean {
  return (
    !!userId && profile?.user_id === userId && profile.status === 'approved' && !!profile.chapter_id
  );
}

export type MembershipState =
  'loading' | 'error' | 'signed-out' | 'missing' | 'pending' | 'approved' | 'removed';
export function membershipState(
  initializing: boolean,
  signedIn: boolean,
  profileState: 'loading' | 'error' | 'missing' | 'ready',
  profile: Profile | null,
  authError: string | null,
): MembershipState {
  if (initializing) return 'loading';
  if (authError) return 'error';
  if (!signedIn) return 'signed-out';
  if (profileState === 'loading' || profileState === 'error') return profileState;
  if (profileState === 'missing') return 'missing';
  if (profile?.status === 'rejected') return 'removed';
  if (profile?.status === 'pending') return 'pending';
  return profile?.status === 'approved' && profile.chapter_id ? 'approved' : 'error';
}

/** Routes used for recovery remain accessible for every membership state. */
export function isEntryRoute(route: string): boolean {
  return [
    'join/[code]',
    'onboarding/enter-code',
    'membership',
    'forgot-password',
    'reset-password',
  ].includes(route);
}
export function canRenderRoute(route: string, state: MembershipState): boolean {
  if (isEntryRoute(route)) return true;
  if (route === 'login' || route === 'signup') return state === 'signed-out';
  if (route === 'onboarding/create-chapter') return state === 'missing';
  return state === 'approved';
}
