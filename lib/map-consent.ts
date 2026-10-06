import type { Profile } from './types';

/** Shared by peer and self pins; absence of V10 consent always fails closed. */
export function hasMapLocation(profile: Partial<Profile> | null): boolean {
  return (
    profile?.map_sharing_enabled === true &&
    profile.status === 'approved' &&
    profile.membership_type === 'alumni' &&
    !!profile.city?.trim() &&
    typeof profile.lat === 'number' &&
    Number.isFinite(profile.lat) &&
    Math.abs(profile.lat) <= 90 &&
    typeof profile.lng === 'number' &&
    Number.isFinite(profile.lng) &&
    Math.abs(profile.lng) <= 180
  );
}
