import { useEffect } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { useRouter, type Href } from 'expo-router';
import { supabase } from './supabase';
import { useAuth } from './auth';

// Push notifications (Expo push service + `device_tokens` table).
//
// Flow: usePushRegistration() (wired in app/_layout.tsx) registers the device
// whenever a session exists → the token lands in `device_tokens` → the
// send-push Edge Function (supabase/functions/send-push/) fans deliveries out
// via https://exp.host. See docs/PUSH_NOTIFICATIONS.md for the full runbook.
//
// Everything here degrades gracefully: no EAS projectId, Expo Go, a
// simulator, denied permission, or a missing `device_tokens` table all
// result in a silent no-op (one console.log the first time), never a throw.

// Foreground presentation: always show the banner + notification list.
// Set at module load so it's in place before any notification arrives.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

/** True for "relation does not exist" — the push migration hasn't run. */
function isMissingTable(message: string): boolean {
  return /does not exist|schema cache/i.test(message);
}

// Log each skip reason exactly once per app launch — registration re-runs on
// every session change and must not spam the console.
const loggedOnce = new Set<string>();
function logOnce(key: string, message: string): void {
  if (loggedOnce.has(key)) return;
  loggedOnce.add(key);
  console.log(message);
}

/** The token registered by this device in this app session (for sign-out cleanup). */
let registeredToken: string | null = null;

/**
 * This device's current Expo push token, or null wherever push can't work
 * (Expo Go, simulator, no EAS projectId). Used by sign-out cleanup when no
 * token was cached this session.
 */
async function resolveDeviceToken(): Promise<string | null> {
  try {
    if (Constants.appOwnership === 'expo' || !Device.isDevice) return null;
    const projectId: unknown = Constants.expoConfig?.extra?.eas?.projectId;
    if (typeof projectId !== 'string' || projectId.length === 0) return null;
    const { granted } = await Notifications.getPermissionsAsync();
    if (!granted) return null;
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    return data;
  } catch {
    return null;
  }
}

/**
 * Register this device for push notifications and store the token under
 * `userId` in `device_tokens`. Never throws — push is an enhancement, and a
 * failure here must not break login or app startup.
 */
export async function registerForPushNotifications(userId: string): Promise<void> {
  try {
    // Remote push does not work in Expo Go on SDK 53+ — it needs a dev client
    // or a real build. Local behavior (handler, listeners) still works there.
    if (Constants.appOwnership === 'expo') {
      logOnce('expo-go', '[push] Skipping registration: remote push is unavailable in Expo Go. Use a development build.');
      return;
    }

    // Simulators have no push transport.
    if (!Device.isDevice) {
      logOnce('simulator', '[push] Skipping registration: push requires a physical device.');
      return;
    }

    // Expo's push service needs the EAS project id (written into
    // extra.eas.projectId by `eas init` — see docs/PUSH_NOTIFICATIONS.md).
    const projectId: unknown = Constants.expoConfig?.extra?.eas?.projectId;
    if (typeof projectId !== 'string' || projectId.length === 0) {
      logOnce('project-id', '[push] Skipping registration: no EAS projectId in app config. Run `eas init` first.');
      return;
    }

    // Android needs a channel before notifications can display at all.
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    // Ask politely: only prompt if the user hasn't decided yet. A past "no"
    // stays a no — re-prompting on every launch is hostile (and iOS wouldn't
    // show the dialog again anyway).
    const existing = await Notifications.getPermissionsAsync();
    let granted = existing.granted;
    if (!granted && existing.canAskAgain) {
      const requested = await Notifications.requestPermissionsAsync();
      granted = requested.granted;
    }
    if (!granted) {
      logOnce('permission', '[push] Notifications permission not granted — skipping registration.');
      return;
    }

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });

    // Upsert keyed on (user_id, token): re-registering the same device is a
    // timestamp refresh, and one user can hold tokens for several devices.
    const { error } = await supabase.from('device_tokens').upsert(
      {
        user_id: userId,
        token,
        platform: Platform.OS,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,token' },
    );

    if (error) {
      if (isMissingTable(error.message)) {
        logOnce('table', '[push] device_tokens table not found — run supabase/migrations/app-v3-push.sql.');
      } else {
        console.warn('[push] Failed to store push token:', error.message);
      }
      return;
    }

    registeredToken = token;
  } catch (err) {
    // Includes network failures from getExpoPushTokenAsync (device offline).
    console.warn('[push] Registration failed:', err instanceof Error ? err.message : err);
  }
}

/**
 * Delete this device's token row so a signed-out user stops receiving
 * notifications on it. Call BEFORE supabase.auth.signOut() — the delete runs
 * under the user's RLS session. Other devices' tokens are left alone.
 */
export async function unregisterPushToken(userId: string): Promise<void> {
  try {
    // Prefer the token cached at registration. If this session never cached
    // one (e.g. registration failed at launch but a previous session stored a
    // row), re-resolve the device's token so sign-out on a shared device
    // never leaves the old user's row receiving pushes.
    let token = registeredToken;
    if (!token) token = await resolveDeviceToken();
    if (!token) return;

    const { error } = await supabase
      .from('device_tokens')
      .delete()
      .eq('user_id', userId)
      .eq('token', token);

    if (error && !isMissingTable(error.message)) {
      console.warn('[push] Failed to remove push token:', error.message);
    }
    registeredToken = null;
  } catch (err) {
    console.warn('[push] Unregister failed:', err instanceof Error ? err.message : err);
  }
}

/**
 * Validate a notification's deep-link payload. Only in-app paths are allowed
 * — the payload crosses a trust boundary (anyone who obtains a device token
 * can send it data), so external URLs / arbitrary objects are rejected.
 */
function extractAppPath(data: Record<string, unknown> | undefined): string | null {
  const url = data?.url;
  if (typeof url !== 'string') return null;
  if (!url.startsWith('/') || url.startsWith('//')) return null;
  return url;
}

/**
 * Registers for push whenever a session exists and routes notification taps
 * to their deep link (data.url, e.g. '/chats/<channelId>'). Mount once at the
 * root — app/_layout.tsx.
 */
export function usePushRegistration(): void {
  const { session } = useAuth();
  const router = useRouter();
  const userId = session?.user?.id ?? null;

  useEffect(() => {
    if (userId) void registerForPushNotifications(userId);
  }, [userId]);

  useEffect(() => {
    const navigate = (response: Notifications.NotificationResponse | null) => {
      const path = extractAppPath(response?.notification.request.content.data);
      if (path) router.push(path as Href);
    };

    // Tap while the app is running (foreground or background).
    const sub = Notifications.addNotificationResponseReceivedListener(navigate);

    // Tap that cold-started the app: the listener above mounts too late to
    // hear it, so replay the last response once. Clearing prevents re-routing
    // on a later remount of this hook.
    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (response) {
          Notifications.clearLastNotificationResponse();
          navigate(response);
        }
      })
      .catch(() => undefined);

    return () => sub.remove();
  }, [router]);
}
