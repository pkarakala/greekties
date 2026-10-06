import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';
import JoinScreen from '../../app/join/[code]';
import MembersScreen from '../../app/admin/members';
import { useChapterMemberList, reinstateMember } from '../../lib/admin';
import { createPendingInviteStore, type InviteStorage } from '../../lib/pending-invite';
import type { Profile } from '../../lib/types';
import RootLayout, { ScreenAccess } from '../../app/_layout';
import { useAuth } from '../../lib/auth';
import * as invites from '../../lib/invite';
import { useLocalSearchParams, useRouter, useSegments } from 'expo-router';

// Decorative native icons are outside the behavior exercised by this suite.
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

jest.mock('../../lib/admin', () => ({
  useChapterMemberList: jest.fn(),
  reinstateMember: jest.fn(),
}));
jest.mock('../../lib/auth', () => ({
  useAuth: jest.fn(),
  AuthProvider: ({ children }: any) => children,
}));
jest.mock('../../lib/supabase', () => ({ supabaseConfigError: null }));
jest.mock('../../lib/notifications', () => ({ usePushRegistration: jest.fn() }));
jest.mock('../../lib/invite', () => ({
  storePendingInviteCode: jest.fn(),
  readPendingInvite: jest.fn(),
  clearPendingInvite: jest.fn(),
  resolveChapterInvite: jest.fn(),
  joinChapterWithInvite: jest.fn(),
}));
jest.mock('expo-router', () => ({
  useLocalSearchParams: jest.fn(),
  useRouter: jest.fn(),
  useSegments: jest.fn(),
  Stack: () => null,
}));
jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual<any>('react-native-safe-area-context/jest/mock').default,
);

const mockedInvites = jest.mocked(invites);
const replace = jest.fn(),
  push = jest.fn();
const saved = { code: 'code-a', revision: 'r1' };
let auth: ReturnType<typeof useAuth>;
const chapter = {
  id: 'a',
  name: 'Pi Beta Phi',
  designation: 'California Zeta',
  university: 'UCSB',
};

beforeEach(() => {
  jest.clearAllMocks();
  auth = {
    initializing: false,
    session: { user: { id: 'user' } } as any,
    profile: null,
    profileState: 'missing',
    authError: null,
    refreshProfile: jest.fn(async () => {}),
    retrySession: jest.fn(async () => {}),
    blockedIds: new Set(),
    refreshBlockedIds: jest.fn(async () => {}),
    signOut: jest.fn(async () => {}),
  };
  jest.mocked(useAuth).mockImplementation(() => auth);
  jest.mocked(useRouter).mockReturnValue({ replace, push } as any);
  jest.mocked(useLocalSearchParams).mockReturnValue({ code: 'code-a' });
  jest.mocked(useSegments).mockReturnValue(['login']);
  mockedInvites.storePendingInviteCode.mockResolvedValue({ invite: saved, warning: null });
  mockedInvites.readPendingInvite.mockResolvedValue({ invite: saved, warning: null });
  mockedInvites.clearPendingInvite.mockResolvedValue({ cleared: true, warning: null });
  mockedInvites.resolveChapterInvite.mockResolvedValue({ kind: 'valid', chapter });
  mockedInvites.joinChapterWithInvite.mockResolvedValue({ error: null });
});

describe('chapter entry screens (mock backend)', () => {
  it('preserves organization, designation and university and saves before auth', async () => {
    auth.session = null;
    const view = render(<JoinScreen />);
    await view.findByText('Pi Beta Phi');
    expect(view.getByText('California Zeta')).toBeTruthy();
    expect(view.getByText('UCSB')).toBeTruthy();
    fireEvent.press(view.getByText('Sign up to join'));
    expect(mockedInvites.storePendingInviteCode).toHaveBeenCalledWith('code-a');
    expect(replace).toHaveBeenCalledWith({ pathname: '/signup', params: { code: 'code-a' } });
    expect(mockedInvites.clearPendingInvite).not.toHaveBeenCalled();
  });
  it('retains invitations through join failure and clears only a successful retry', async () => {
    mockedInvites.joinChapterWithInvite.mockResolvedValueOnce({ error: 'Temporarily unavailable' });
    const view = render(<JoinScreen />);
    fireEvent.press(await view.findByText('Join chapter'));
    await view.findByText('Temporarily unavailable');
    expect(mockedInvites.clearPendingInvite).not.toHaveBeenCalled();
    fireEvent.press(view.getByText('Join chapter'));
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/onboarding/complete-profile'));
    expect(mockedInvites.clearPendingInvite).toHaveBeenCalledWith(saved);
  });
  it('distinguishes temporary preview failure from invalid/revoked/expired codes', async () => {
    mockedInvites.resolveChapterInvite
      .mockResolvedValueOnce({ kind: 'error' })
      .mockResolvedValueOnce({ kind: 'invalid' });
    const view = render(<JoinScreen />);
    fireEvent.press(await view.findByText('Retry invitation'));
    await view.findByText(/invalid, revoked, or expired/);
    expect(view.queryByText('Join chapter')).toBeNull();
    expect(mockedInvites.clearPendingInvite).not.toHaveBeenCalled();
  });
  it.each(['pending', 'rejected'])('does not offer joining for %s membership', async (status) => {
    auth.profile = { status, chapter_id: 'a' } as any;
    auth.profileState = 'ready';
    const view = render(<JoinScreen />);
    await view.findByText('Pi Beta Phi');
    expect(view.queryByText('Join chapter')).toBeNull();
    expect(view.getByText('Sign out')).toBeTruthy();
    expect(mockedInvites.joinChapterWithInvite).not.toHaveBeenCalled();
  });
  it('blocks a different chapter regardless of membership status', async () => {
    auth.profile = { status: 'pending', chapter_id: 'other' } as any;
    auth.profileState = 'ready';
    const view = render(<JoinScreen />);
    await view.findByText(/This invitation is for a different chapter/);
    expect(view.queryByText('Join chapter')).toBeNull();
  });
  it('handles an already-approved same-chapter invite idempotently', async () => {
    auth.profile = { status: 'approved', chapter_id: 'a' } as any;
    auth.profileState = 'ready';
    const view = render(<JoinScreen />);
    fireEvent.press(await view.findByText('Continue to chapter'));
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/'));
    expect(mockedInvites.joinChapterWithInvite).not.toHaveBeenCalled();
    expect(mockedInvites.clearPendingInvite).toHaveBeenCalledWith(saved);
  });
  it('cannot redirect or clear an invitation after a stale join unmounts', async () => {
    let complete!: (result: { error: null }) => void;
    mockedInvites.joinChapterWithInvite.mockImplementation(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    const view = render(<JoinScreen />);
    fireEvent.press(await view.findByText('Join chapter'));
    view.unmount();
    await act(async () => {
      complete({ error: null });
    });
    expect(mockedInvites.clearPendingInvite).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });
  it('does not redirect over a newer invitation when cleanup detects replacement', async () => {
    mockedInvites.clearPendingInvite.mockResolvedValue({ cleared: false, warning: null });
    const view = render(<JoinScreen />);
    fireEvent.press(await view.findByText('Join chapter'));
    await view.findByText(/Another invitation is now active/);
    expect(replace).not.toHaveBeenCalled();
  });
  it('provides explicit cancellation', async () => {
    const view = render(<JoinScreen />);
    await view.findByText('Join chapter');
    fireEvent.press(view.getByText('Cancel invitation'));
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/membership'));
    expect(mockedInvites.clearPendingInvite).toHaveBeenCalledWith(saved);
  });
  it.each(['loading', 'error', 'missing', 'pending', 'rejected'])(
    'never mounts chapter content while membership is %s',
    async (state) => {
      auth.profileState = ['loading', 'error', 'missing'].includes(state)
        ? (state as any)
        : 'ready';
      auth.profile = ['pending', 'rejected'].includes(state)
        ? ({ status: state, chapter_id: 'a' } as any)
        : null;
      const content = jest.fn(() => <Text>private chapter</Text>);
      const Child = content;
      const view = render(
        <ScreenAccess name="(tabs)">
          <Child />
        </ScreenAccess>,
      );
      await act(async () => {});
      expect(content).not.toHaveBeenCalled();
      expect(view.queryByText('private chapter')).toBeNull();
    },
  );
  it('leaves password recovery mounted even when profile loading fails', () => {
    auth.profileState = 'error';
    const view = render(
      <ScreenAccess name="reset-password">
        <Text>reset form</Text>
      </ScreenAccess>,
    );
    expect(view.getByText('reset form')).toBeTruthy();
  });
  it('keeps sign-out available during a delayed profile read', async () => {
    auth.profileState = 'loading';
    const view = render(
      <ScreenAccess name="(tabs)">
        <Text>private chapter</Text>
      </ScreenAccess>,
    );
    fireEvent.press(view.getByText('Sign out'));
    await waitFor(() => expect(auth.signOut).toHaveBeenCalled());
  });
  it('saves a cold-start invitation before auth restoration finishes', async () => {
    auth.initializing = true;
    const view = render(
      <ScreenAccess name="join/[code]">
        <JoinScreen />
      </ScreenAccess>,
    );
    await waitFor(() =>
      expect(mockedInvites.storePendingInviteCode).toHaveBeenCalledWith('code-a'),
    );
    expect(view.queryByText('Join chapter')).toBeNull();
  });
});

describe('root redirect lifecycle', () => {
  it('resumes a persisted invitation after login without consuming it', async () => {
    render(<RootLayout />);
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith({
        pathname: '/join/[code]',
        params: { code: saved.code },
      }),
    );
    expect(mockedInvites.clearPendingInvite).not.toHaveBeenCalled();
    expect(replace).toHaveBeenCalledTimes(1);
  });
  it('cancels a delayed invite redirect when password recovery opens', async () => {
    let complete!: (result: { invite: typeof saved; warning: null }) => void;
    mockedInvites.readPendingInvite.mockImplementation(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    const view = render(<RootLayout />);
    jest.mocked(useSegments).mockReturnValue(['reset-password']);
    view.rerender(<RootLayout />);
    await act(async () => {
      complete({ invite: saved, warning: null });
    });
    expect(replace).not.toHaveBeenCalled();
  });
  it('cancels delayed invitation reads on sign-out', async () => {
    let complete!: (result: { invite: typeof saved; warning: null }) => void;
    mockedInvites.readPendingInvite.mockImplementation(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    const view = render(<RootLayout />);
    auth.session = null;
    jest.mocked(useSegments).mockReturnValue(['(tabs)']);
    view.rerender(<RootLayout />);
    await act(async () => {
      complete({ invite: saved, warning: null });
    });
    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith('/login');
  });
});

describe('explicit admin reinstatement UI', () => {
  const reload = jest.fn();
  beforeEach(() => {
    auth.profile = { status: 'approved', chapter_id: 'a', admin_role: 'owner' } as Profile;
    auth.profileState = 'ready';
    jest.mocked(useChapterMemberList).mockImplementation((_chapterId, status) => ({
      loading: false,
      error: null,
      reload,
      members:
        status === 'rejected'
          ? [
              {
                id: 'removed',
                name: 'Taylor',
                status: 'rejected',
                admin_role: null,
                membership_type: 'active',
              } as Profile,
            ]
          : [],
    }));
    jest.mocked(reinstateMember).mockResolvedValue(null);
  });
  it('requires the explicit confirmation action and reloads after success', async () => {
    const view = render(<MembersScreen />);
    fireEvent.press(view.getByText('View removed / declined members'));
    fireEvent.press(view.getByText('Reinstate'));
    expect(reinstateMember).not.toHaveBeenCalled();
    expect(view.getByText(/without admin privileges/)).toBeTruthy();
    fireEvent.press(view.getByText('Confirm reinstatement'));
    await waitFor(() => expect(reload).toHaveBeenCalled());
    expect(reinstateMember).toHaveBeenCalledWith('removed');
  });
  it('keeps a failed reinstatement available for retry', async () => {
    jest.mocked(reinstateMember).mockResolvedValue('Couldn’t reinstate this member.');
    const view = render(<MembersScreen />);
    fireEvent.press(view.getByText('View removed / declined members'));
    fireEvent.press(view.getByText('Reinstate'));
    fireEvent.press(view.getByText('Confirm reinstatement'));
    await view.findByText('Couldn’t reinstate this member.');
    expect(view.getByText('Confirm reinstatement')).toBeTruthy();
    expect(reload).not.toHaveBeenCalled();
  });
  it('does not offer reinstatement to an ordinary member', () => {
    auth.profile = { ...auth.profile!, admin_role: null };
    const view = render(<MembersScreen />);
    expect(view.getByText('Chapter admin access required.')).toBeTruthy();
    expect(view.queryByText('Reinstate')).toBeNull();
    expect(useChapterMemberList).toHaveBeenCalledWith(null, 'approved');
  });
});

it('clears the eventual revision when canceled before invitation persistence completes', async () => {
  let finishSave!: (value: { invite: typeof saved; warning: null }) => void;
  mockedInvites.storePendingInviteCode.mockImplementation(
    () =>
      new Promise((resolve) => {
        finishSave = resolve;
      }),
  );
  const view = render(<JoinScreen />);
  fireEvent.press(view.getByText('Cancel invitation'));
  await act(async () => {
    finishSave({ invite: saved, warning: null });
  });
  expect(mockedInvites.clearPendingInvite).toHaveBeenCalledWith(saved);
});

function deferredSaveHarness({ holdResult = false, failWrite = false, failDelete = false } = {}) {
  const values = new Map<string, string>();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const adapter: InviteStorage = {
    getItem: async (key) => values.get(key) ?? null,
    setItem: jest.fn(async (key: string, value: string) => {
      if (!holdResult) await gate;
      if (failWrite) throw new Error('Storage unavailable');
      values.set(key, value);
    }),
    removeItem: jest.fn(async (key: string) => {
      if (failDelete) throw new Error('Storage unavailable');
      values.delete(key);
    }),
  };
  const store = createPendingInviteStore(adapter);
  let written: Awaited<ReturnType<typeof store.save>> | undefined;
  mockedInvites.storePendingInviteCode.mockImplementation(async (input) => {
    const result = await store.save(input);
    written = result;
    if (holdResult) await gate;
    return result;
  });
  mockedInvites.clearPendingInvite.mockImplementation(store.clear);
  return {
    adapter,
    store,
    release,
    written: () => written,
    restart: () => createPendingInviteStore(adapter).read(),
  };
}

describe('cancellation durability across a pending save', () => {
  it.each([false, true])(
    'removes the eventual stored record, including after unmount=%s',
    async (unmount) => {
      const storage = deferredSaveHarness();
      const view = render(<JoinScreen />);
      await waitFor(() => expect(storage.adapter.setItem).toHaveBeenCalled());
      fireEvent.press(view.getByText('Cancel invitation'));
      expect(replace).not.toHaveBeenCalled();
      if (unmount) view.unmount();
      await act(async () => {
        storage.release();
      });
      await waitFor(() => expect(storage.adapter.removeItem).toHaveBeenCalled());
      expect((await storage.restart()).invite).toBeNull();
      if (unmount) expect(replace).not.toHaveBeenCalled();
      else expect(replace).toHaveBeenCalledWith('/membership');
    },
  );
  it('retains an unfinished save on ordinary unmount without explicit cancellation', async () => {
    const storage = deferredSaveHarness();
    const view = render(<JoinScreen />);
    view.unmount();
    await act(async () => {
      storage.release();
    });
    expect((await storage.restart()).invite?.code).toBe('code-a');
    expect(storage.adapter.removeItem).not.toHaveBeenCalled();
  });
  it.each(['code-b', 'code-a'])(
    'cannot clear replacement %s while cancellation is waiting',
    async (replacementCode) => {
      const storage = deferredSaveHarness({ holdResult: true });
      const view = render(<JoinScreen />);
      await waitFor(() => expect(storage.written()).toBeDefined());
      fireEvent.press(view.getByText('Cancel invitation'));
      view.unmount();
      await storage.store.save('code-b');
      const replacement = await storage.store.save(replacementCode);
      await act(async () => {
        storage.release();
      });
      expect(mockedInvites.clearPendingInvite).toHaveBeenCalledWith(storage.written()!.invite);
      expect((await storage.restart()).invite).toEqual(replacement.invite);
      expect(storage.adapter.removeItem).not.toHaveBeenCalled();
      expect(replace).not.toHaveBeenCalled();
    },
  );
  it('cleans up memory fallback when the pending storage write fails', async () => {
    const storage = deferredSaveHarness({ failWrite: true });
    const view = render(<JoinScreen />);
    fireEvent.press(view.getByText('Cancel invitation'));
    await act(async () => {
      storage.release();
    });
    expect(mockedInvites.clearPendingInvite).toHaveBeenCalledWith(storage.written()!.invite);
    expect((await storage.store.read()).invite).toBeNull();
    expect((await storage.restart()).invite).toBeNull();
  });
  it('reports unavailable deletion instead of claiming durable cancellation', async () => {
    const storage = deferredSaveHarness({ failDelete: true });
    const view = render(<JoinScreen />);
    fireEvent.press(view.getByText('Cancel invitation'));
    await act(async () => {
      storage.release();
    });
    await view.findByText(/could not be removed from device storage/);
    expect(replace).not.toHaveBeenCalled();
    expect((await storage.store.read()).invite).toBeNull();
    // An unavailable store cannot guarantee durable removal; warn explicitly.
    expect((await storage.restart()).invite?.code).toBe('code-a');
  });
});

it('does not redirect away from a retained draft after a same-account validation error', async () => {
  auth.profile = { user_id: 'user', id: 'p', status: 'approved', chapter_id: 'a' } as Profile;
  auth.profileState = 'error';
  jest.mocked(useSegments).mockReturnValue(['(tabs)']);
  render(<RootLayout />);
  await act(async () => {});
  expect(replace).not.toHaveBeenCalled();
});

it('never renders another account’s approved snapshot during an identity transition', () => {
  auth.profile = {
    user_id: 'previous-user',
    id: 'p',
    status: 'approved',
    chapter_id: 'a',
  } as Profile;
  auth.profileState = 'ready';
  const view = render(
    <ScreenAccess name="(tabs)">
      <Text>Previous private content</Text>
    </ScreenAccess>,
  );
  expect(view.queryByText('Previous private content', { includeHiddenElements: true })).toBeNull();
});
