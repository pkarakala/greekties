import * as SecureStore from 'expo-secure-store';

// Invite codes must survive the email-confirmation round trip: the user signs
// up with a code, confirms in Mail, then logs in — the code is restored here.
const KEY = 'gt.pending_invite_code';

export async function storePendingInviteCode(code: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(KEY, code);
  } catch {
    // Non-fatal: worst case the user re-opens the invite link.
  }
}

/** Returns the stored code (if any) and clears it. */
export async function consumePendingInviteCode(): Promise<string | null> {
  try {
    const code = await SecureStore.getItemAsync(KEY);
    if (code) await SecureStore.deleteItemAsync(KEY);
    return code;
  } catch {
    return null;
  }
}
