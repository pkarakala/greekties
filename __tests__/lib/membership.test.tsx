import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { fetchMembershipCounts, memberScope, useMembershipCounts } from '@/lib/home';
import { directoryMembership, fetchDirectoryPage, useChapterMembers } from '@/lib/directory';
import { slice5Db, deferred, type Result } from '../helpers/slice5-db';

jest.mock('@/lib/auth', () => ({ useAuth: jest.fn() }));
jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn() } }));
let db: ReturnType<typeof slice5Db>;
let auth: any;
const member = (i: number, membership_type = 'active', extra = {}) => ({
  id: `profile-${String(i).padStart(5, '0')}`,
  user_id: `user-${i}`,
  chapter_id: 'chapter-a',
  name: `Member ${String(i).padStart(5, '0')}`,
  status: 'approved',
  membership_type,
  role: membership_type === 'active' ? 'Alumni' : 'Current member',
  open_to_mentor: true,
  is_hiring: true,
  industry: 'Technology',
  ...extra,
});
const fail: Result = { data: null, error: { message: 'offline' }, count: null };
beforeEach(() => {
  jest.clearAllMocks();
  db = slice5Db();
  jest.mocked(supabase.from).mockImplementation(db.from);
  auth = {
    session: { user: { id: 'viewer' } },
    profile: {
      user_id: 'viewer',
      chapter_id: 'chapter-a',
      status: 'approved',
      membership_type: 'active',
    },
    blockedIds: new Set(),
  };
  jest.mocked(useAuth).mockImplementation(() => auth);
});

describe('authorized membership totals', () => {
  it('counts more than 1,000 in each designation without using loaded pages, roles or map consent', async () => {
    db.rows.profiles = [
      ...Array.from({ length: 1103 }, (_, i) => member(i)),
      ...Array.from({ length: 1207 }, (_, i) =>
        member(i + 2000, 'alumni', { map_sharing_enabled: false }),
      ),
      member(9000, 'active', { chapter_id: 'other' }),
      member(9001, 'alumni', { status: 'pending' }),
      member(9002, 'active', { status: 'rejected' }),
      member(9003, 'alumni'),
    ];
    expect(await fetchMembershipCounts('chapter-a', new Set(['user-9003']))).toEqual({
      active: 1103,
      alumni: 1207,
    });
    for (const call of db.calls) {
      expect(call.steps).toContainEqual(['select', 'id', { count: 'exact', head: true }]);
      expect(call.steps).toContainEqual(['eq', 'status', 'approved']);
      expect(call.steps).toContainEqual(['eq', 'chapter_id', 'chapter-a']);
      expect(call.steps).toContainEqual(['neq', 'user_id', 'user-9003']);
      expect(call.steps.some(([method]) => ['range', 'limit'].includes(method))).toBe(false);
    }
  });
  it.each([null, undefined, -1, NaN])('rejects unavailable count metadata %s', async (count) => {
    db.setIntercept(() => ({ data: null, count, error: null }));
    await expect(fetchMembershipCounts('chapter-a', new Set())).rejects.toThrow();
  });
  it('distinguishes initial failure, true zero, retained refresh data, and recovery', async () => {
    db.setIntercept(() => fail);
    const { result } = renderHook(() =>
      useMembershipCounts('scope-a', 'chapter-a', auth.blockedIds),
    );
    expect(result.current.data).toBeUndefined();
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.error).toBe(true));
    expect(result.current.data).toBeUndefined();
    db.setIntercept(null);
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.data).toEqual({ active: 0, alumni: 0 }));
    db.rows.profiles = [member(1)];
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.data?.active).toBe(1));
    db.setIntercept((call) =>
      call.steps.some((s) => s[1] === 'membership_type' && s[2] === 'alumni') ? fail : undefined,
    );
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.error).toBe(true));
    expect(result.current.data).toEqual({ active: 1, alumni: 0 });
    db.setIntercept(null);
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.error).toBe(false));
  });
  it.each(['account', 'chapter', 'blocks', 'removed', 'designation'])(
    'hides counts and rejects late results on %s changes',
    async (change) => {
      db.rows.profiles = [member(1)];
      const { result, rerender } = renderHook(() =>
        useMembershipCounts(
          memberScope(auth.profile, auth.session.user.id),
          auth.profile.chapter_id,
          auth.blockedIds,
        ),
      );
      await waitFor(() => expect(result.current.data?.active).toBe(1));
      const late = deferred<Result>();
      db.setIntercept(() => late.promise);
      act(() => result.current.reload());
      await waitFor(() => expect(result.current.loading).toBe(true));
      if (change === 'account')
        auth = {
          ...auth,
          session: { user: { id: 'next' } },
          profile: { ...auth.profile, user_id: 'next' },
        };
      if (change === 'chapter') auth.profile = { ...auth.profile, chapter_id: 'chapter-b' };
      if (change === 'blocks') auth.blockedIds = new Set(['user-1']);
      if (change === 'removed') auth.profile = { ...auth.profile, status: 'rejected' };
      if (change === 'designation') auth.profile = { ...auth.profile, membership_type: 'alumni' };
      db.setIntercept(null);
      db.rows.profiles = [];
      rerender({});
      expect(result.current.data).toBeUndefined();
      await waitFor(() => expect(result.current.loading).toBe(false));
      await act(async () => late.resolve({ data: null, count: 99, error: null }));
      expect(result.current.data?.active ?? 0).toBe(0);
    },
  );
});

describe('membership directory filters', () => {
  it.each(['active', 'alumni'] as const)(
    'combines %s with search, mentor, hiring, industry and block constraints before paging',
    async (membershipType) => {
      db.rows.profiles = [
        ...Array.from({ length: 123 }, (_, i) => member(i, membershipType, { company: 'QA Lab' })),
        member(500, membershipType, { company: 'QA Lab', status: 'pending' }),
        member(501, membershipType, { company: 'QA Lab', chapter_id: 'other' }),
        member(502, membershipType, { company: 'QA Lab', open_to_mentor: false }),
        member(503, membershipType, { company: 'QA Lab', is_hiring: false }),
        member(504, membershipType === 'active' ? 'alumni' : 'active', { company: 'QA Lab' }),
      ];
      const filters = {
        membershipType,
        query: 'QA Lab',
        mentorsOnly: true,
        hiringOnly: true,
        industry: 'Technology',
      };
      const pages = await Promise.all(
        [0, 50, 100].map((offset) =>
          fetchDirectoryPage('chapter-a', filters, offset, new Set(['user-0'])),
        ),
      );
      expect(pages.map((p) => p.length)).toEqual([50, 50, 22]);
      expect(new Set(pages.flat().map((p) => p.id)).size).toBe(122);
      expect(pages.flat().every((p) => p.membership_type === membershipType)).toBe(true);
    },
  );
  it('resets pagination and drops obsolete pages across membership changes', async () => {
    db.rows.profiles = [...Array.from({ length: 75 }, (_, i) => member(i)), member(100, 'alumni')];
    let membershipType: 'active' | 'alumni' | null = 'active';
    const { result, rerender } = renderHook(() =>
      useChapterMembers('chapter-a', auth.blockedIds, { membershipType }),
    );
    await waitFor(() => expect(result.current.members).toHaveLength(50));
    const late = deferred<Result>();
    db.setIntercept((c) =>
      c.steps.some((s) => s[0] === 'range' && s[1] === 50) ? late.promise : undefined,
    );
    let pending!: Promise<void>;
    act(() => {
      pending = result.current.loadMore();
    });
    membershipType = 'alumni';
    rerender({});
    expect(result.current.members).toHaveLength(0);
    await waitFor(() => expect(result.current.members.map((p) => p.id)).toEqual(['profile-00100']));
    await act(async () => {
      late.resolve({ data: [member(70)], error: null });
      await pending;
    });
    expect(result.current.members).toHaveLength(1);
    db.setIntercept(null);
    membershipType = null;
    rerender({});
    await waitFor(() => expect(result.current.hasMore).toBe(true));
    await act(async () => result.current.loadMore());
    expect(result.current.members).toHaveLength(76);
  });
  it.each(['Alumni', 'current', 'role.eq.Alumni', ['alumni'], undefined])(
    'does not infer designation from route text %s',
    (value) => {
      expect(directoryMembership(value)).toBeNull();
    },
  );
});
