// Expo replaces this public literal during bundling. No server secret is involved.
export const isOwnerQaBuild = process.env.EXPO_PUBLIC_BUILD_VARIANT === 'owner-qa';
export const ownerQaDeletionNotice = 'Account deletion is unavailable in this owner-only QA build.';
