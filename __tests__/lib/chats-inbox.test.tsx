import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { supabase } from '@/lib/supabase';
import {
  readChatsGroups,
  readChatsMentorship,
  selectChatsRows,
  useChatsInbox,
  type ChatsInboxRow,
} from '@/lib/chats-inbox';
import { chatsDb } from '../helpers/chats-db';
import { deferred } from '../helpers/message-db';
jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn(), rpc: jest.fn() } }));
const none = new Set<string>();
const group = (id = 'same', chapter_id = 'chapter') => ({
  id,
  chapter_id,
  name: `Group ${id}`,
  description: null,
  created_at: '2099-01-01',
});
const request = (id = 'same', status = 'accepted', other = 'peer') => ({
  id,
  status,
  chapter_id: 'chapter',
  from_user_id: 'me',
  to_user_id: other,
  message: 'PRIVATE INTRO',
  created_at: '2099-01-01',
});
const message = (
  id: string,
  parent: string,
  created_at = '2026-10-11T12:00:00Z',
  sender_id = 'peer',
) => ({ id, channel_id: parent, request_id: parent, created_at, sender_id, content: `Text ${id}` });
let db: ReturnType<typeof chatsDb>;
beforeEach(() => {
  db = chatsDb();
  (supabase.from as any).mockImplementation(db.from);
  (supabase.rpc as any).mockImplementation(db.rpc);
});
describe('unified inbox authorized adapters', () => {
  it('uses only accepted participant requests in this chapter and never request text/dates', async () => {
    db.rows.mentorship_requests = [
      request(),
      request('pending', 'pending'),
      request('declined', 'declined'),
      { ...request('foreign'), chapter_id: 'other' },
      { ...request('stranger'), from_user_id: 'stranger' },
      request('blocked', 'accepted', 'blocked'),
    ];
    const data = await readChatsMentorship('chapter', 'me', new Set(['blocked']));
    expect(data.rows).toHaveLength(1);
    expect(data.rows[0]).toMatchObject({
      key: 'mentorship:same',
      name: 'Member',
      avatar: null,
      activity: null,
      preview: 'Accepted mentorship · No messages yet',
    });
    expect(JSON.stringify(data)).not.toContain('PRIVATE INTRO');
    expect(db.calls.filter((q) => q.table === 'messages')).toHaveLength(1);
  });
  it('uses bounded latest visible messages, real profiles, and type-prefixed unique IDs', async () => {
    db.rows.channels = [group()];
    db.rows.mentorship_requests = [request()];
    db.rows.profiles = [{ user_id: 'peer', name: 'Synthetic Mentor', avatar_url: null }];
    db.rows.channel_messages = [
      message('older', 'same'),
      message('hidden', 'same', '2026-10-12', 'blocked'),
    ];
    db.rows.messages = [message('mentor', 'same', '2026-10-11T13:00:00Z')];
    const groups = await readChatsGroups('chapter', new Set(['blocked']));
    const mentors = await readChatsMentorship('chapter', 'me', none);
    expect(groups.rows[0].preview).toBe('Text older');
    const sorted = selectChatsRows([...groups.rows, ...mentors.rows], 'All', '');
    expect(sorted.map((r) => r.key)).toEqual(['mentorship:same', 'group:same']);
    expect(sorted[0].name).toBe('Synthetic Mentor');
    for (const q of db.calls.filter((c) => ['messages', 'channel_messages'].includes(c.table)))
      expect(q.steps).toContainEqual(['limit', 1]);
  });
  it('omits admin management-only channels and fails closed on access-check failure', async () => {
    db.rows.channels = [group('yes'), group('secret'), group('foreign', 'other')];
    db.denied.add('secret');
    expect((await readChatsGroups('chapter', none)).rows.map((r) => r.id)).toEqual(['yes']);
    (supabase.rpc as any).mockResolvedValue({ data: null, error: { message: 'offline' } });
    await expect(readChatsGroups('chapter', none)).rejects.toThrow('access');
  });
  it('distinguishes unavailable previews from empty conversations and recovers', async () => {
    db.rows.channels = [group()];
    db.queue.channel_messages = [Promise.resolve({ data: null, error: { message: 'offline' } })];
    const failed = await readChatsGroups('chapter', none);
    expect(failed).toMatchObject({
      previewsUnavailable: true,
      rows: [{ preview: 'Preview unavailable', activity: null }],
    });
    const recovered = await readChatsGroups('chapter', none);
    expect(recovered).toMatchObject({
      previewsUnavailable: false,
      rows: [{ preview: 'No messages yet', activity: null }],
    });
  });
  it('bounds source reads and tells the UI when more results exist', async () => {
    db.rows.channels = Array.from({ length: 110 }, (_, i) => group(String(i).padStart(3, '0')));
    const data = await readChatsGroups('chapter', none);
    expect(data.hasMore).toBe(true);
    expect(data.rows).toHaveLength(100);
    expect(db.calls[0].steps).toContainEqual(['limit', 101]);
  });
  it('combines Groups/search, handles equal/missing times stably, and deduplicates keys', () => {
    const row = (
      key: string,
      kind: 'group' | 'mentorship',
      activity: string | null,
    ): ChatsInboxRow => ({
      key,
      id: key,
      kind,
      activity,
      name: key,
      preview: 'Portfolio',
      avatar: null,
    });
    const rows = [
      row('mentorship:b', 'mentorship', '2026-10-11'),
      row('group:b', 'group', null),
      row('group:a', 'group', '2026-10-11'),
      row('group:a', 'group', '2026-10-11'),
    ];
    expect(selectChatsRows(rows.reverse(), 'All', ' PORTFOLIO ').map((r) => r.key)).toEqual([
      'group:a',
      'mentorship:b',
      'group:b',
    ]);
    expect(selectChatsRows(rows, 'Groups', 'portfolio').map((r) => r.key)).toEqual([
      'group:a',
      'group:b',
    ]);
    expect(selectChatsRows(rows, 'All', 'missing')).toEqual([]);
  });
});
describe('independent source lifetimes', () => {
  const mount = () =>
    renderHook(
      ({
        scope,
        user,
        chapter,
        blocked,
      }: {
        scope: string;
        user: string;
        chapter: string;
        blocked: ReadonlySet<string>;
      }) => useChatsInbox(scope, chapter, user, blocked),
      {
        initialProps: {
          scope: 'me:chapter',
          user: 'me',
          chapter: 'chapter',
          blocked: none as ReadonlySet<string>,
        },
      },
    );
  it('keeps good groups during mentorship failure and source Retry recovers', async () => {
    db.rows.channels = [group()];
    db.rows.mentorship_requests = [request()];
    db.queue.mentorship_requests = [Promise.reject(new Error('offline'))];
    const ui = mount();
    await waitFor(() => expect(ui.result.current.mentors.error).toBe(true));
    await waitFor(() => expect(ui.result.current.rows).toHaveLength(1));
    expect(ui.result.current.groups.error).toBe(false);
    act(() => ui.result.current.mentors.reload());
    await waitFor(() => expect(ui.result.current.rows).toHaveLength(2));
  });
  it('keeps good mentorship during group failure', async () => {
    db.rows.mentorship_requests = [request()];
    db.queue.channels = [Promise.reject(new Error('offline'))];
    const ui = mount();
    await waitFor(() => expect(ui.result.current.groups.error).toBe(true));
    await waitFor(() => expect(ui.result.current.rows[0]?.kind).toBe('mentorship'));
  });
  it('retains same-scope content with explicit stale/error state, then clears revoked channels on success', async () => {
    db.rows.channels = [group()];
    const ui = mount();
    await waitFor(() => expect(ui.result.current.rows).toHaveLength(1));
    db.queue.channels = [Promise.reject(new Error('offline'))];
    act(() => ui.result.current.groups.reload());
    await waitFor(() => expect(ui.result.current.groups.error).toBe(true));
    expect(ui.result.current.rows).toHaveLength(1);
    db.denied.add('same');
    act(() => ui.result.current.groups.reload());
    await waitFor(() => expect(ui.result.current.rows).toEqual([]));
    expect(ui.result.current.groups.error).toBe(false);
  });
  it('evicts a revoked cached preview and search match despite a sibling visibility error', async () => {
    db.rows.channels = [group('restricted'), group('public')];
    db.rows.channel_messages = [message('private-preview', 'restricted')];
    const ui = mount();
    await waitFor(() => expect(ui.result.current.rows).toHaveLength(2));
    expect(selectChatsRows(ui.result.current.rows, 'All', 'private-preview')).toHaveLength(1);
    (supabase.rpc as any).mockImplementation(async (_: string, params: any) =>
      params.p_channel_id === 'restricted'
        ? { data: false, error: null }
        : { data: null, error: { message: 'offline' } },
    );
    act(() => ui.result.current.groups.reload());
    await waitFor(() => expect(ui.result.current.groups.error).toBe(true));
    expect(ui.result.current.rows.map((row) => row.id)).toEqual(['public']);
    expect(selectChatsRows(ui.result.current.rows, 'All', 'private-preview')).toEqual([]);
    expect(ui.result.current.groups.data?.rows.map((row) => row.id)).toEqual(['public']);
  });
  it('evicts a conclusively denied row immediately while a sibling is still pending', async () => {
    db.rows.channels = [group('restricted'), group('public')];
    const ui = mount();
    await waitFor(() => expect(ui.result.current.rows).toHaveLength(2));
    const sibling = deferred();
    (supabase.rpc as any).mockImplementation(async (_: string, params: any) =>
      params.p_channel_id === 'restricted' ? { data: false, error: null } : sibling.promise,
    );
    act(() => ui.result.current.groups.reload());
    await waitFor(() => expect(ui.result.current.rows.map((row) => row.id)).toEqual(['public']));
    expect(ui.result.current.groups.loading).toBe(true);
    await act(async () => sibling.resolve({ data: null, error: { message: 'offline' } }));
    await waitFor(() => expect(ui.result.current.groups.error).toBe(true));
    expect(ui.result.current.rows.map((row) => row.id)).toEqual(['public']);
  });
  it('ignores obsolete denial callbacks after a newer refresh or an account/chapter change', async () => {
    db.rows.channels = [group('same')];
    const ui = mount();
    await waitFor(() => expect(ui.result.current.rows).toHaveLength(1));
    const old = deferred();
    (supabase.rpc as any).mockImplementationOnce(() => old.promise);
    act(() => ui.result.current.groups.reload());
    await waitFor(() => expect(ui.result.current.groups.loading).toBe(true));
    act(() => ui.result.current.groups.reload());
    await waitFor(() => expect(ui.result.current.groups.loading).toBe(false));
    await act(async () => old.resolve({ data: false, error: null }));
    expect(ui.result.current.rows.map((row) => row.id)).toEqual(['same']);
    const oldAccount = deferred();
    (supabase.rpc as any).mockImplementationOnce(() => oldAccount.promise);
    act(() => ui.result.current.groups.reload());
    await waitFor(() => expect(ui.result.current.groups.loading).toBe(true));
    db.rows.channels = [group('same', 'elsewhere')];
    ui.rerender({ scope: 'other:elsewhere', user: 'other', chapter: 'elsewhere', blocked: none });
    await waitFor(() => expect(ui.result.current.groups.loading).toBe(false));
    await act(async () => oldAccount.resolve({ data: false, error: null }));
    expect(ui.result.current.rows.map((row) => row.id)).toEqual(['same']);
  });
  it('hides old rows immediately across account/chapter scope changes and ignores late responses', async () => {
    db.rows.channels = [group()];
    const ui = mount();
    await waitFor(() => expect(ui.result.current.rows).toHaveLength(1));
    const old = deferred();
    db.queue.channels = [old.promise];
    act(() => ui.result.current.groups.reload());
    await waitFor(() => expect(ui.result.current.groups.loading).toBe(true));
    ui.rerender({ scope: 'other:elsewhere', user: 'other', chapter: 'elsewhere', blocked: none });
    expect(ui.result.current.rows).toEqual([]);
    await act(async () => old.resolve({ data: [group('late')], error: null }));
    await waitFor(() => expect(ui.result.current.groups.loading).toBe(false));
    expect(ui.result.current.rows).toEqual([]);
  });
  it('ignores a late accepted-request response after a newer focus read removes acceptance', async () => {
    const old = deferred();
    db.queue.mentorship_requests = [old.promise];
    const ui = mount();
    await waitFor(() => expect(db.calls.some((c) => c.table === 'mentorship_requests')).toBe(true));
    db.rows.mentorship_requests = [request('same', 'declined')];
    act(() => ui.result.current.mentors.reload());
    await waitFor(() => expect(ui.result.current.mentors.loading).toBe(false));
    await act(async () => old.resolve({ data: [request()], error: null }));
    expect(ui.result.current.rows).toEqual([]);
  });
  it('immediately hides newly blocked mentor rows and group previews during an in-flight refresh', async () => {
    db.rows.channels = [group()];
    db.rows.channel_messages = [message('secret', 'same')];
    db.rows.mentorship_requests = [request()];
    const ui = mount();
    await waitFor(() => expect(ui.result.current.rows).toHaveLength(2));
    db.queue.channels = [deferred().promise];
    db.queue.mentorship_requests = [deferred().promise];
    ui.rerender({
      scope: 'me:chapter',
      user: 'me',
      chapter: 'chapter',
      blocked: new Set(['peer']),
    });
    expect(ui.result.current.rows).toHaveLength(1);
    expect(ui.result.current.rows[0].preview).toBe('Preview unavailable');
    expect(selectChatsRows(ui.result.current.rows, 'All', 'secret')).toEqual([]);
  });
});
