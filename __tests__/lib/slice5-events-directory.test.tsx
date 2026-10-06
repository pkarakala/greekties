import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { fetchRsvpMeta, rsvp, useEvent, useEvents, deleteEvent } from '@/lib/events';
import { useJob } from '@/lib/jobs';
import { fetchDirectoryPage, directorySearchExpression, useChapterMembers } from '@/lib/directory';
import { slice5Db, deferred, type Result } from '../helpers/slice5-db';

jest.mock('@/lib/auth', () => ({ useAuth: jest.fn() }));
jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn() } }));
let db: ReturnType<typeof slice5Db>;
let auth: any;
const event = {
  id: 'event-a',
  chapter_id: 'chapter-a',
  created_by: 'peer',
  title: 'Dinner',
  category: 'social',
  starts_at: '2099-01-01T12:00:00Z',
  ends_at: null,
};
const fail: Result = { data: null, error: { message: 'offline' }, count: null };
const member = (i: number, extra = {}) => ({
  id: `profile-${String(i).padStart(3, '0')}`,
  user_id: `member-${i}`,
  chapter_id: 'chapter-a',
  status: 'approved',
  name: `Member ${String(i).padStart(3, '0')}`,
  ...extra,
});
beforeEach(() => {
  jest.clearAllMocks();
  db = slice5Db();
  auth = {
    session: { user: { id: 'user-a' } },
    profile: { chapter_id: 'chapter-a', status: 'approved' },
    blockedIds: new Set(),
  };
  jest.mocked(useAuth).mockImplementation(() => auth);
  jest.mocked(supabase.from).mockImplementation(db.from);
  db.rows.events = [event];
});
describe('attendance reads and writes', () => {
  it('distinguishes confirmed zero/no response from failed metadata', async () => {
    expect(await fetchRsvpMeta('event-a', 'user-a', 'chapter-a')).toMatchObject({
      goingCount: 0,
      maybeCount: 0,
      myStatus: null,
    });
    db.setIntercept((c) => (c.table === 'event_rsvps' ? fail : undefined));
    const { result } = renderHook(() => useEvent('event-a', 'user-a', auth.blockedIds));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.event?.title).toBe('Dinner');
    expect(result.current.goingCount).toBeNull();
    expect(result.current.myStatus).toBeUndefined();
    expect(result.current.metaError).toBeTruthy();
  });
  it('bounds the preview to four and excludes inaccessible/unapproved profiles without changing RLS-visible counts', async () => {
    db.rows.event_rsvps = Array.from({ length: 9 }, (_, i) => ({
      event_id: 'event-a',
      user_id: `member-${i}`,
      status: 'going',
    }));
    db.rows.profiles = [
      member(0),
      member(1, { status: 'rejected' }),
      member(2, { chapter_id: 'other' }),
      member(3),
    ];
    const meta = await fetchRsvpMeta('event-a', 'user-a', 'chapter-a');
    expect(meta.goingCount).toBe(9);
    expect(meta.attendees.map((p) => p.user_id)).toEqual(['member-0', 'member-3']);
    const select = db.calls.find((c) => c.table === 'profiles')!;
    expect(select.steps).toContainEqual(['select', 'id, user_id, name, avatar_url']);
    expect(select.steps).toContainEqual(['limit', 4]);
  });
  it('retains details and attendance through failed same-scope retry, then clears removed content', async () => {
    db.rows.event_rsvps = [{ event_id: 'event-a', user_id: 'user-a', status: 'going' }];
    const { result } = renderHook(() => useEvent('event-a', 'user-a', auth.blockedIds));
    await waitFor(() => expect(result.current.goingCount).toBe(1));
    db.setIntercept((c) => (c.table === 'events' ? fail : undefined));
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.event?.title).toBe('Dinner');
    expect(result.current.myStatus).toBe('going');
    db.setIntercept(null);
    db.rows.events = [];
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.event).toBeNull());
    expect(result.current.myStatus).toBeUndefined();
  });
  it.each(['account', 'event', 'chapter', 'blocked'])(
    'rejects obsolete responses across %s scope',
    async (change) => {
      const late = deferred<Result>();
      db.setIntercept((c) => (c.table === 'events' ? late.promise : undefined));
      let id = 'event-a';
      const { result, rerender } = renderHook(() =>
        useEvent(id, auth.session.user.id, auth.blockedIds),
      );
      await waitFor(() => expect(db.calls.length).toBeGreaterThan(0));
      if (change === 'account') auth = { ...auth, session: { user: { id: 'user-b' } } };
      if (change === 'event') id = 'event-b';
      if (change === 'chapter')
        auth = { ...auth, profile: { ...auth.profile, chapter_id: 'chapter-b' } };
      if (change === 'blocked') auth = { ...auth, blockedIds: new Set(['peer']) };
      db.rows.events = [];
      db.setIntercept(null);
      rerender({});
      await waitFor(() => expect(result.current.loading).toBe(false));
      await act(async () => late.resolve({ data: event, error: null }));
      expect(result.current.event).toBeNull();
    },
  );
  it('serializes rapid writes, including another caller for the same RSVP key', async () => {
    const late = deferred<Result>();
    let writes = 0;
    db.setIntercept((c) => {
      if (c.steps.some((s) => s[0] === 'upsert')) {
        writes++;
        return late.promise;
      }
    });
    const first = rsvp('event-a', 'user-a', 'going');
    await expect(rsvp('event-a', 'user-a', 'maybe')).resolves.toMatchObject({
      error: expect.stringMatching(/still saving/),
    });
    late.resolve({
      data: { event_id: 'event-a', user_id: 'user-a', status: 'going' },
      error: null,
    });
    await expect(first).resolves.toEqual({ error: null });
    expect(writes).toBe(1);
  });
  it.each(['empty', 'thrown', 'denied'])(
    'reconciles %s acknowledgments before reporting the desired current RSVP',
    async (mode) => {
      db.rows.event_rsvps = [{ event_id: 'event-a', user_id: 'user-a', status: 'maybe' }];
      db.setIntercept((c) => {
        if (c.steps.some((s) => s[0] === 'upsert')) {
          if (mode === 'thrown') throw new Error('lost reply');
          return { data: null, error: mode === 'denied' ? { message: 'denied' } : null };
        }
      });
      await expect(rsvp('event-a', 'user-a', 'maybe')).resolves.toEqual({ error: null });
      expect(db.calls.some((c) => c.steps.some((s) => s[0] === 'eq' && s[1] === 'user_id'))).toBe(
        true,
      );
      db.rows.event_rsvps = [];
      expect((await rsvp('event-a', 'user-a', 'going')).error).toBeTruthy();
    },
  );
  it('prevents stale reloads and late errors from rolling back a confirmed new response', async () => {
    const { result } = renderHook(() => useEvent('event-a', 'user-a', auth.blockedIds));
    await waitFor(() => expect(result.current.myStatus).toBeNull());
    const oldRead = deferred<Result>();
    let holdRead = true;
    db.setIntercept((c) => {
      if (c.table === 'events' && holdRead) return oldRead.promise;
      const upsert = c.steps.find((s) => s[0] === 'upsert');
      if (upsert) {
        db.rows.event_rsvps = [upsert[1]];
        return { data: upsert[1], error: null };
      }
    });
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.loading).toBe(true));
    await act(async () => {
      holdRead = false;
      await result.current.saveRsvp('going');
    });
    await waitFor(() => expect(result.current.myStatus).toBe('going'));
    await act(async () => oldRead.resolve(fail));
    expect(result.current.myStatus).toBe('going');
    expect(result.current.error).toBeNull();
  });
  it('does not claim a zero-row event deletion succeeded', async () => {
    db.rows.events = [];
    expect((await deleteEvent('event-a')).error).toBeTruthy();
  });
  it('excludes ended and no-end started events while keeping future and in-progress events', async () => {
    const now = Date.now();
    db.rows.events = [
      event,
      {
        ...event,
        id: 'ongoing',
        starts_at: new Date(now - 3600000).toISOString(),
        ends_at: new Date(now + 3600000).toISOString(),
      },
      {
        ...event,
        id: 'ended',
        starts_at: new Date(now - 7200000).toISOString(),
        ends_at: new Date(now - 1).toISOString(),
      },
      { ...event, id: 'unknown-end', starts_at: new Date(now - 1).toISOString() },
    ];
    const { result } = renderHook(() => useEvents('chapter-a'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.events.map((e) => e.id)).toEqual(['ongoing', 'event-a']);
  });
});
describe('server directory filtering and pagination', () => {
  it('finds a member beyond the first page with combined filters', async () => {
    db.rows.profiles = Array.from({ length: 125 }, (_, i) =>
      member(i, { open_to_mentor: i === 124, is_hiring: true, industry: 'Technology' }),
    );
    const page = await fetchDirectoryPage(
      'chapter-a',
      { query: '124', mentorsOnly: true, hiringOnly: true, industry: 'Technology' },
      0,
      new Set(),
    );
    expect(page.map((p) => p.id)).toEqual(['profile-124']);
    expect(db.calls[0].steps).toContainEqual(['order', 'id', { ascending: true }]);
  });
  it.each([
    "O'Neil",
    'Acme, Inc.',
    'R&D (West)',
    '"quoted"',
    '100%_match',
    'star*literal',
    'back\\slash',
    'x),status.eq.pending',
  ])('treats punctuation as literal search: %s', async (text) => {
    db.rows.profiles = [member(0, { name: text }), member(1, { name: 'Other' })];
    expect(
      (await fetchDirectoryPage('chapter-a', { query: text }, 0, new Set())).map((p) => p.id),
    ).toEqual(['profile-000']);
    expect(directorySearchExpression(text)).toContain('name.imatch."');
  });
  it('resets pagination and ignores an obsolete page on a new query', async () => {
    db.rows.profiles = Array.from({ length: 100 }, (_, i) => member(i));
    let query = '';
    const { result, rerender } = renderHook(() =>
      useChapterMembers('chapter-a', auth.blockedIds, { query }),
    );
    await waitFor(() => expect(result.current.members.length).toBe(50));
    const late = deferred<Result>();
    db.setIntercept((c) =>
      c.steps.some((s) => s[0] === 'range' && s[1] === 50) ? late.promise : undefined,
    );
    let pending: Promise<void>;
    act(() => {
      pending = result.current.loadMore();
    });
    query = '099';
    rerender({});
    await waitFor(() => expect(result.current.members.map((p) => p.id)).toEqual(['profile-099']));
    await act(async () => {
      late.resolve({ data: [member(99)], error: null });
      await pending;
    });
    expect(result.current.members.map((p) => p.id)).toEqual(['profile-099']);
    expect(result.current.hasMore).toBe(false);
  });
  it('keeps same-query data on retry failure but not across account or filter changes', async () => {
    db.rows.profiles = [member(1)];
    let mentorsOnly = false;
    const { result, rerender } = renderHook(() =>
      useChapterMembers('chapter-a', auth.blockedIds, { mentorsOnly }),
    );
    await waitFor(() => expect(result.current.members).toHaveLength(1));
    db.setIntercept(() => fail);
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.members).toHaveLength(1);
    mentorsOnly = true;
    rerender({});
    expect(result.current.members).toHaveLength(0);
    await waitFor(() => expect(result.current.loading).toBe(false));
    db.setIntercept(null);
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.error).toBeNull());
    expect(result.current.members).toHaveLength(0);
    auth = { ...auth, session: { user: { id: 'user-b' } } };
    rerender({});
    expect(result.current.members).toHaveLength(0);
    await waitFor(() => expect(result.current.loading).toBe(false));
  });
  it('does not issue duplicate pagination requests and retries a failed page', async () => {
    db.rows.profiles = Array.from({ length: 75 }, (_, i) => member(i));
    const { result } = renderHook(() => useChapterMembers('chapter-a', auth.blockedIds));
    await waitFor(() => expect(result.current.hasMore).toBe(true));
    db.setIntercept((c) =>
      c.steps.some((s) => s[0] === 'range' && s[1] === 50) ? fail : undefined,
    );
    await act(async () => {
      await Promise.all([result.current.loadMore(), result.current.loadMore()]);
    });
    expect(result.current.error).toBeTruthy();
    expect(result.current.members).toHaveLength(50);
    db.setIntercept(null);
    await act(async () => result.current.loadMore());
    expect(result.current.members).toHaveLength(75);
    expect(result.current.hasMore).toBe(false);
  });
});
it('job loading distinguishes errors, preserved retry data, removal, and account change', async () => {
  db.rows.job_postings = [{ id: 'job', posted_by: 'peer', title: 'Engineer' }];
  const { result, rerender } = renderHook(() => useJob('job', auth.blockedIds));
  await waitFor(() => expect(result.current.job?.title).toBe('Engineer'));
  db.setIntercept(() => fail);
  act(() => result.current.reload());
  await waitFor(() => expect(result.current.error).toBeTruthy());
  expect(result.current.job?.title).toBe('Engineer');
  auth = { ...auth, session: { user: { id: 'different' } } };
  rerender({});
  expect(result.current.job).toBeNull();
  db.setIntercept(null);
  db.rows.job_postings = [];
  act(() => result.current.reload());
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.error).toBeNull();
  expect(result.current.job).toBeNull();
});
it('a pending RSVP cannot adopt or reconcile under a replacement account', async () => {
  const late = deferred<Result>();
  db.setIntercept((c) => (c.steps.some((s) => s[0] === 'upsert') ? late.promise : undefined));
  const { result, rerender } = renderHook(() =>
    useEvent('event-a', auth.session.user.id, auth.blockedIds),
  );
  await waitFor(() => expect(result.current.myStatus).toBeNull());
  let pending: Promise<void>;
  act(() => {
    pending = result.current.saveRsvp('going');
  });
  await waitFor(() => expect(result.current.saving).toBe(true));
  auth = { ...auth, session: { user: { id: 'user-b' } } };
  rerender({});
  await waitFor(() => expect(result.current.loading).toBe(false));
  const before = db.calls.length;
  await act(async () => {
    late.resolve(fail);
    await pending;
  });
  expect(result.current.myStatus).toBeNull();
  expect(result.current.saveError).toBeNull();
  expect(db.calls.length).toBe(before);
});
it('retains confirmed response and read-only counts if attendance refresh fails after saving', async () => {
  const { result } = renderHook(() => useEvent('event-a', 'user-a', auth.blockedIds));
  await waitFor(() => expect(result.current.goingCount).toBe(0));
  db.setIntercept((call) => {
    const write = call.steps.find((step) => step[0] === 'upsert');
    if (write) return { data: write[1], error: null };
    if (call.table === 'event_rsvps') return fail;
  });
  await act(async () => result.current.saveRsvp('going'));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.myStatus).toBe('going');
  expect(result.current.goingCount).toBe(0);
  expect(result.current.metaError).toBeTruthy();
});
