import * as SecureStore from 'expo-secure-store';

// Local per-channel "last read" timestamps for unread indicators (V1 approach
// from CHAT_ARCHITECTURE.md). Channel ids are UUIDs, which are valid SecureStore
// keys (alphanumeric + hyphen).
const keyFor = (channelId: string) => `lastread_${channelId}`;

export async function getLastRead(channelId: string): Promise<number> {
  try {
    const v = await SecureStore.getItemAsync(keyFor(channelId));
    return v ? Number(v) : 0;
  } catch {
    return 0;
  }
}

export async function markRead(channelId: string, when: number = Date.now()): Promise<void> {
  try {
    await SecureStore.setItemAsync(keyFor(channelId), String(when));
  } catch {
    // Non-fatal: unread dots are a nicety, not correctness-critical.
  }
}
