import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { Mock } from 'jest-mock';
import { fetchReactions, toggleReaction, subscribeToReactions } from '../../lib/reactions';
import { supabase } from '../../lib/supabase';

jest.mock('../../lib/supabase', () => ({
  supabase: { from: jest.fn(), channel: jest.fn(), removeChannel: jest.fn() },
  supabaseConfigError: null,
}));

const mockedFrom = supabase.from as unknown as Mock<(table: string) => unknown>;
const mockedChannel = supabase.channel as unknown as Mock<(name: string) => unknown>;
const mockedRemoveChannel = supabase.removeChannel as unknown as Mock<
  (sub: unknown) => unknown
>;

type QueryResult = { data: unknown; error: { message: string } | null };

/** Mocks the fetch chain: from().select().in().order() → result. */
function mockSelectChain(result: QueryResult) {
  const order = jest.fn<() => Promise<QueryResult>>().mockResolvedValue(result);
  const inFn = jest.fn(() => ({ order }));
  mockedFrom.mockReturnValue({ select: jest.fn(() => ({ in: inFn })) });
}

describe('fetchReactions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns an empty map without querying when there are no message ids', async () => {
    const map = await fetchReactions([], 'me');
    expect(map.size).toBe(0);
    expect(mockedFrom).not.toHaveBeenCalled();
  });

  it('aggregates rows into { emoji, count, mine } per message', async () => {
    mockSelectChain({
      data: [
        { message_id: 'msg-1', user_id: 'user-a', emoji: '👍' },
        { message_id: 'msg-1', user_id: 'me', emoji: '👍' },
        { message_id: 'msg-1', user_id: 'user-b', emoji: '❤️' },
        { message_id: 'msg-2', user_id: 'user-c', emoji: '🔥' },
      ],
      error: null,
    });

    const map = await fetchReactions(['msg-1', 'msg-2'], 'me');
    expect(mockedFrom).toHaveBeenCalledWith('message_reactions');
    // First-seen emoji order is preserved (stable pill order).
    expect(map.get('msg-1')).toEqual([
      { emoji: '👍', count: 2, mine: true },
      { emoji: '❤️', count: 1, mine: false },
    ]);
    expect(map.get('msg-2')).toEqual([{ emoji: '🔥', count: 1, mine: false }]);
    expect(map.size).toBe(2);
  });

  it('never marks mine when the viewer is signed out (null userId)', async () => {
    mockSelectChain({
      data: [{ message_id: 'msg-1', user_id: 'user-a', emoji: '👍' }],
      error: null,
    });
    const map = await fetchReactions(['msg-1'], null);
    expect(map.get('msg-1')).toEqual([{ emoji: '👍', count: 1, mine: false }]);
  });

  it('returns an empty map on missing-table error (pre-migration)', async () => {
    mockSelectChain({
      data: null,
      error: { message: 'relation "message_reactions" does not exist' },
    });
    const map = await fetchReactions(['msg-1'], 'me');
    expect(map.size).toBe(0);
  });

  it('returns an empty map when the query throws', async () => {
    mockedFrom.mockImplementation(() => {
      throw new Error('network down');
    });
    const map = await fetchReactions(['msg-1'], 'me');
    expect(map.size).toBe(0);
  });
});

describe('toggleReaction', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  /** Mocks from() with an insert result and a delete().eq().eq().eq() chain. */
  function mockToggleChains(
    insertError: { message: string } | null,
    deleteError: { message: string } | null = null,
  ) {
    const insert = jest
      .fn<() => Promise<{ error: { message: string } | null }>>()
      .mockResolvedValue({ error: insertError });
    const eqFinal = jest
      .fn<() => Promise<{ error: { message: string } | null }>>()
      .mockResolvedValue({ error: deleteError });
    const eqMid = jest.fn(() => ({ eq: eqFinal }));
    const eqFirst = jest.fn(() => ({ eq: eqMid }));
    const del = jest.fn(() => ({ eq: eqFirst }));
    mockedFrom.mockReturnValue({ insert, delete: del });
    return { insert, del, eqFirst, eqMid, eqFinal };
  }

  it('inserts the reaction row on the happy path (added, not removed)', async () => {
    const { insert, del } = mockToggleChains(null);
    await expect(toggleReaction('msg-1', 'me', '👍')).resolves.toEqual({
      error: null,
      removed: false,
    });
    expect(mockedFrom).toHaveBeenCalledWith('message_reactions');
    expect(insert).toHaveBeenCalledWith({ message_id: 'msg-1', user_id: 'me', emoji: '👍' });
    expect(del).not.toHaveBeenCalled();
  });

  it('deletes the row (toggle off) when the insert hits a duplicate key', async () => {
    const { del, eqFirst, eqMid, eqFinal } = mockToggleChains({
      message: 'duplicate key value violates unique constraint "message_reactions_pkey"',
    });
    await expect(toggleReaction('msg-1', 'me', '👍')).resolves.toEqual({
      error: null,
      removed: true,
    });
    expect(del).toHaveBeenCalled();
    expect(eqFirst).toHaveBeenCalledWith('message_id', 'msg-1');
    expect(eqMid).toHaveBeenCalledWith('user_id', 'me');
    expect(eqFinal).toHaveBeenCalledWith('emoji', '👍');
  });

  it('maps missing-table errors to friendly copy, not raw Postgres text', async () => {
    mockToggleChains({ message: 'relation "message_reactions" does not exist' });
    const { error } = await toggleReaction('msg-1', 'me', '👍');
    expect(error).toMatch(/aren’t set up yet/);
    expect(error).not.toMatch(/relation|does not exist/);
  });

  it('returns a friendly message when the toggle-off delete fails', async () => {
    mockToggleChains({ message: 'duplicate key value' }, { message: 'network failure' });
    const { error } = await toggleReaction('msg-1', 'me', '👍');
    expect(error).toMatch(/Couldn’t remove/);
    expect(error).not.toMatch(/network failure/);
  });

  it('returns a friendly message when the insert throws', async () => {
    mockedFrom.mockImplementation(() => {
      throw new Error('network down');
    });
    const { error } = await toggleReaction('msg-1', 'me', '👍');
    expect(error).toMatch(/Couldn’t add/);
  });
});

describe('subscribeToReactions', () => {
  type Handler = (payload: { new?: unknown; old?: unknown }) => void;
  let handlers: { event: string; fn: Handler }[];
  let builder: { on: Mock; subscribe: Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    handlers = [];
    builder = {
      on: jest.fn((_type: unknown, cfg: unknown, fn: unknown) => {
        handlers.push({ event: (cfg as { event: string }).event, fn: fn as Handler });
        return builder;
      }),
      subscribe: jest.fn(() => 'sub-handle'),
    };
    mockedChannel.mockReturnValue(builder);
  });

  function emit(event: 'INSERT' | 'DELETE', payload: { new?: unknown; old?: unknown }) {
    for (const h of handlers) if (h.event === event) h.fn(payload);
  }

  it('subscribes one channel to INSERT and DELETE on message_reactions', () => {
    subscribeToReactions('chan-1', () => [], () => {});
    expect(mockedChannel).toHaveBeenCalledTimes(1);
    expect(mockedChannel).toHaveBeenCalledWith(expect.stringMatching(/^reactions:chan-1:[a-z0-9]+-\d+$/));
    expect(handlers.map((h) => h.event).sort()).toEqual(['DELETE', 'INSERT']);
    expect(builder.subscribe).toHaveBeenCalledTimes(1);
  });

  it('calls onChange only for message ids currently in messageIds()', () => {
    const onChange = jest.fn();
    subscribeToReactions('chan-1', () => ['msg-1', 'msg-2'], onChange);

    emit('INSERT', { new: { message_id: 'msg-1', user_id: 'u', emoji: '👍' } });
    emit('INSERT', { new: { message_id: 'msg-other', user_id: 'u', emoji: '👍' } });
    emit('DELETE', { old: { message_id: 'msg-2', user_id: 'u', emoji: '❤️' } });

    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange).toHaveBeenNthCalledWith(1, 'msg-1');
    expect(onChange).toHaveBeenNthCalledWith(2, 'msg-2');
  });

  it('ignores DELETE payloads missing old-row columns (no replica identity full)', () => {
    const onChange = jest.fn();
    subscribeToReactions('chan-1', () => ['msg-1'], onChange);

    emit('DELETE', { old: {} });
    emit('DELETE', { old: undefined });
    emit('DELETE', { old: { message_id: 42 } }); // non-string guard

    expect(onChange).not.toHaveBeenCalled();
  });

  it('returns an unsubscribe function that removes the channel', () => {
    const unsubscribe = subscribeToReactions('chan-1', () => [], () => {});
    expect(mockedRemoveChannel).not.toHaveBeenCalled();
    unsubscribe();
    expect(mockedRemoveChannel).toHaveBeenCalledWith('sub-handle');
  });
});
