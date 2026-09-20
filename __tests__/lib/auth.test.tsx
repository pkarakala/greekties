import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { useEffect, useState } from 'react';
import { AppState, Platform, Text, TextInput } from 'react-native';
import { AuthProvider, useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { ScreenAccess } from '../../app/_layout';
import { fetchBlockedIds } from '../../lib/moderation';

jest.mock('../../lib/supabase', () => ({
  supabase: {
    auth: { getSession: jest.fn(), onAuthStateChange: jest.fn(), signOut: jest.fn() },
    from: jest.fn(),
    channel: jest.fn(),
    removeChannel: jest.fn(),
  },
}));
jest.mock('../../lib/notifications', () => ({
  unregisterPushToken: jest.fn(),
  usePushRegistration: jest.fn(),
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: jest.fn(), push: jest.fn() }) }));
jest.mock('../../lib/invite', () => ({
  readPendingInvite: async () => ({ invite: null, warning: null }),
}));
jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual<any>('react-native-safe-area-context/jest/mock').default,
);
jest.mock('../../lib/moderation', () => ({
  fetchBlockedIds: jest.fn(async () => new Set()),
  subscribeToBlockListChanges: jest.fn(() => () => {}),
  applyBlockListChange: jest.fn(),
}));
const db = supabase as any;
let notify: (event: string, session: any) => void;
let auth: ReturnType<typeof useAuth>;
const session = (id: string) => ({ user: { id } });
function Probe() {
  const state = useAuth();
  useEffect(() => {
    auth = state;
  }, [state]);
  return (
    <Text>{`${state.initializing}:${state.profileState}:${state.profile?.user_id ?? 'none'}`}</Text>
  );
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(fetchBlockedIds).mockResolvedValue(new Set());
  db.auth.getSession.mockResolvedValue({ data: { session: session('a') }, error: null });
  db.auth.onAuthStateChange.mockImplementation((callback: typeof notify) => {
    notify = callback;
    return { data: { subscription: { unsubscribe: jest.fn() } } };
  });
  const channel = { on: jest.fn().mockReturnThis(), subscribe: jest.fn().mockReturnThis() };
  db.channel.mockReturnValue(channel);
});
function profileRead(read: () => unknown) {
  db.from.mockReturnValue({ select: () => ({ eq: () => ({ maybeSingle: read }) }) });
}

describe('auth/profile lifecycle', () => {
  it('keeps delayed reads loading, reports failures, and retries to a distinct missing state', async () => {
    const pending = deferred<any>();
    const read = jest
      .fn<() => Promise<any>>()
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValue({ data: null, error: null });
    profileRead(read);
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() => expect(read).toHaveBeenCalledTimes(1));
    expect(auth.profileState).toBe('loading');
    await act(async () => {
      pending.resolve({ data: null, error: { message: 'offline' } });
    });
    expect(auth.profileState).toBe('error');
    await act(async () => {
      await auth.refreshProfile();
    });
    expect(auth.profileState).toBe('missing');
  });
  it('discards stale profile results after switching accounts and signing out', async () => {
    const old = deferred<any>(),
      current = deferred<any>();
    const read = jest
      .fn<() => Promise<any>>()
      .mockReturnValueOnce(old.promise)
      .mockReturnValueOnce(current.promise);
    profileRead(read);
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() => expect(read).toHaveBeenCalledTimes(1));
    await act(async () => {
      notify('SIGNED_IN', session('b'));
    });
    await act(async () => {
      current.resolve({ data: { user_id: 'b', status: 'pending' }, error: null });
    });
    expect(auth.profile?.user_id).toBe('b');
    await act(async () => {
      old.resolve({ data: { user_id: 'a', status: 'approved' }, error: null });
    });
    expect(auth.profile?.user_id).toBe('b');
    await act(async () => {
      notify('SIGNED_OUT', null);
    });
    expect(auth.profile).toBeNull();
    expect(auth.session).toBeNull();
  });
  it('does not let an old session restore overwrite a newer auth event', async () => {
    const initial = deferred<any>();
    db.auth.getSession.mockReturnValue(initial.promise);
    profileRead(async () => ({ data: { user_id: 'b', status: 'approved' }, error: null }));
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await act(async () => {
      notify('SIGNED_IN', session('b'));
    });
    await act(async () => {
      initial.resolve({ data: { session: session('a') }, error: null });
    });
    expect(auth.session?.user.id).toBe('b');
    expect(auth.profile?.user_id).toBe('b');
  });
  it('reports session restore errors instead of treating them as signed out', async () => {
    db.auth.getSession.mockRejectedValue(new Error('unavailable'));
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() => expect(auth.initializing).toBe(false));
    expect(auth.authError).toMatch(/restore/);
  });
});

function Draft() {
  const [draft, setDraft] = useState('');
  return <TextInput testID="draft" value={draft} onChangeText={setDraft} />;
}
function ProtectedDraft() {
  return (
    <AuthProvider>
      <Probe />
      <ScreenAccess name="(tabs)">
        <Draft />
      </ScreenAccess>
    </AuthProvider>
  );
}
const approved = { user_id: 'a', status: 'approved', chapter_id: 'chapter-a', id: 'profile-a' };

it('preserves a private draft through actual same-account profile revalidation', async () => {
  const pending = deferred<any>();
  const read = jest
    .fn<() => Promise<any>>()
    .mockResolvedValueOnce({ data: approved, error: null })
    .mockReturnValueOnce(pending.promise);
  profileRead(read);
  const view = render(<ProtectedDraft />);
  fireEvent.changeText(await view.findByTestId('draft'), 'Unsaved introduction');
  let refresh!: Promise<void>;
  await act(async () => {
    refresh = auth.refreshProfile();
  });
  expect(view.queryByTestId('draft')).toBeNull();
  await act(async () => {
    pending.resolve({ data: approved, error: null });
    await refresh;
  });
  expect(view.getByTestId('draft').props.value).toBe('Unsaved introduction');
});

const originalPlatform = Platform.OS;
afterEach(() => {
  jest.restoreAllMocks();
  Platform.OS = originalPlatform;
});

it.each([
  'foreground / photo picker',
  'browser focus',
  'TOKEN_REFRESHED',
  'SIGNED_IN',
  'USER_UPDATED',
])('retains drafts and block state during %s revalidation', async (trigger) => {
  let onActive!: (state: 'active' | 'background') => void;
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, handler) => {
    onActive = handler;
    return { remove: jest.fn() };
  });
  let onFocus!: () => void;
  const webDescriptors = ['addEventListener', 'removeEventListener', 'location'].map(
    (key) => [key, Object.getOwnPropertyDescriptor(window, key)] as const,
  );
  if (trigger === 'browser focus') {
    Platform.OS = 'web';
    Object.defineProperties(window, {
      addEventListener: {
        configurable: true,
        value: (_name: string, callback: () => void) => {
          onFocus = callback;
        },
      },
      removeEventListener: { configurable: true, value: jest.fn() },
      location: { configurable: true, value: { href: 'https://example.invalid/' } },
    });
  }
  try {
    const pending = deferred<any>();
    const read = jest
      .fn<() => Promise<any>>()
      .mockResolvedValueOnce({ data: approved, error: null })
      .mockReturnValueOnce(pending.promise);
    profileRead(read);
    jest.mocked(fetchBlockedIds).mockResolvedValue(new Set(['blocked-person']));
    const view = render(<ProtectedDraft />);
    fireEvent.changeText(await view.findByTestId('draft'), 'Unsaved introduction');
    await waitFor(() => expect(auth.blockedIds.has('blocked-person')).toBe(true));
    await act(async () => {
      if (trigger === 'browser focus') onFocus();
      else if (trigger === 'foreground / photo picker') {
        onActive('background');
        onActive('active');
      } else notify(trigger, session('a'));
    });
    expect(auth.profileState).toBe('loading');
    expect(auth.profile).toEqual(approved);
    expect(auth.blockedIds.has('blocked-person')).toBe(true);
    expect(view.queryByTestId('draft')).toBeNull();
    expect(view.getByTestId('draft', { includeHiddenElements: true }).props.value).toBe(
      'Unsaved introduction',
    );
    await act(async () => {
      pending.resolve({ data: approved, error: null });
    });
    expect(view.getByTestId('draft').props.value).toBe('Unsaved introduction');
    expect(auth.blockedIds.has('blocked-person')).toBe(true);
    view.unmount();
  } finally {
    if (trigger === 'browser focus')
      for (const [key, descriptor] of webDescriptors) {
        if (descriptor) Object.defineProperty(window, key, descriptor);
        else Reflect.deleteProperty(window, key);
      }
  }
});

it.each(['approved', 'rejected', 'missing'])(
  'keeps a failed-refresh draft hidden until retry confirms %s',
  async (result) => {
    const failed = deferred<any>(),
      retried = deferred<any>();
    const read = jest
      .fn<() => Promise<any>>()
      .mockResolvedValueOnce({ data: approved, error: null })
      .mockReturnValueOnce(failed.promise)
      .mockReturnValueOnce(retried.promise);
    profileRead(read);
    const view = render(<ProtectedDraft />);
    fireEvent.changeText(await view.findByTestId('draft'), 'Unsaved introduction');
    await act(async () => {
      void auth.refreshProfile();
    });
    await act(async () => {
      failed.resolve({ data: null, error: { message: 'offline' } });
    });
    expect(auth.profileState).toBe('error');
    expect(view.queryByTestId('draft')).toBeNull();
    expect(view.getByTestId('draft', { includeHiddenElements: true }).props.value).toBe(
      'Unsaved introduction',
    );
    fireEvent.press(view.getByText('Check again'));
    await act(async () => {
      retried.resolve({
        data: result === 'missing' ? null : { ...approved, status: result },
        error: null,
      });
    });
    if (result === 'approved')
      expect(view.getByTestId('draft').props.value).toBe('Unsaved introduction');
    else {
      expect(view.queryByTestId('draft', { includeHiddenElements: true })).toBeNull();
      // A later reinstatement/join must never revive the discarded private draft.
      read.mockResolvedValue({ data: approved, error: null });
      await act(async () => {
        await auth.refreshProfile();
      });
      expect(view.getByTestId('draft').props.value).toBe('');
    }
  },
);

it.each(['logout', 'account switch'])(
  'discards private drafts and blocks on %s during revalidation',
  async (change) => {
    const stale = deferred<any>(),
      other = deferred<any>();
    const read = jest
      .fn<() => Promise<any>>()
      .mockResolvedValueOnce({ data: approved, error: null })
      .mockReturnValueOnce(stale.promise)
      .mockReturnValueOnce(other.promise);
    profileRead(read);
    jest
      .mocked(fetchBlockedIds)
      .mockResolvedValueOnce(new Set(['blocked-a']))
      .mockResolvedValue(new Set());
    const view = render(<ProtectedDraft />);
    fireEvent.changeText(await view.findByTestId('draft'), 'Private account A draft');
    await act(async () => {
      void auth.refreshProfile();
    });
    await act(async () => {
      notify(
        change === 'logout' ? 'SIGNED_OUT' : 'SIGNED_IN',
        change === 'logout' ? null : session('b'),
      );
    });
    expect(view.queryByTestId('draft', { includeHiddenElements: true })).toBeNull();
    expect(auth.blockedIds.has('blocked-a')).toBe(false);
    await act(async () => {
      stale.resolve({ data: approved, error: null });
    });
    expect(view.queryByTestId('draft', { includeHiddenElements: true })).toBeNull();
    if (change === 'account switch') {
      await act(async () => {
        other.resolve({ data: { ...approved, user_id: 'b', id: 'profile-b' }, error: null });
      });
      expect(view.getByTestId('draft').props.value).toBe('');
      expect(auth.profile?.user_id).toBe('b');
    }
  },
);
