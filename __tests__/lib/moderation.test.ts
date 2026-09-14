import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { Mock } from 'jest-mock';
import {
  applyBlockListChange,
  blockUser,
  canShowActorContent,
  fetchBlockedIds,
  filterBlockedActors,
  reportContent,
  subscribeToBlockListChanges,
  unblockUser,
} from '../../lib/moderation';
import { supabase } from '../../lib/supabase';

jest.mock('../../lib/supabase', () => ({
  supabase: { from: jest.fn() },
  supabaseConfigError: null,
}));

const mockedFrom = supabase.from as unknown as Mock<(table: string) => unknown>;

/** Friendly copy shown when the moderation tables haven't been migrated yet. */
const NOT_AVAILABLE_COPY = /isn’t available yet/;

function mockInsertResult(error: { message: string } | null) {
  const insert = jest
    .fn<() => Promise<{ error: { message: string } | null }>>()
    .mockResolvedValue({ error });
  mockedFrom.mockReturnValue({ insert });
}

describe('reportContent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const input = {
    reporterId: 'user-1',
    chapterId: 'chapter-1',
    targetType: 'profile' as const,
    targetId: 'user-2',
    reason: 'harassment',
  };

  it('returns no error on success', async () => {
    mockInsertResult(null);
    await expect(reportContent(input)).resolves.toEqual({ error: null });
    expect(mockedFrom).toHaveBeenCalledWith('content_reports');
  });

  it('maps missing-table errors to the friendly copy, not raw Postgres text', async () => {
    mockInsertResult({ message: 'relation "content_reports" does not exist' });
    const { error } = await reportContent(input);
    expect(error).toMatch(NOT_AVAILABLE_COPY);
    expect(error).not.toMatch(/relation|does not exist/);
  });

  it('maps schema-cache errors (PostgREST variant of missing table) the same way', async () => {
    mockInsertResult({
      message: "Could not find the table 'content_reports' in the schema cache",
    });
    const { error } = await reportContent(input);
    expect(error).toMatch(NOT_AVAILABLE_COPY);
  });

  it('returns a generic friendly message for other errors', async () => {
    mockInsertResult({ message: 'permission denied for table content_reports' });
    const { error } = await reportContent(input);
    expect(error).toMatch(/Couldn’t submit the report/);
    expect(error).not.toMatch(/permission denied/);
  });
});

describe('blockUser', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns no error on success', async () => {
    mockInsertResult(null);
    await expect(blockUser('user-1', 'user-2')).resolves.toEqual({ error: null });
    expect(mockedFrom).toHaveBeenCalledWith('user_blocks');
  });

  it('treats duplicate-key (already blocked) as success', async () => {
    mockInsertResult({
      message: 'duplicate key value violates unique constraint "user_blocks_pkey"',
    });
    await expect(blockUser('user-1', 'user-2')).resolves.toEqual({ error: null });
  });

  it('maps missing-table errors to the friendly copy', async () => {
    mockInsertResult({ message: 'relation "user_blocks" does not exist' });
    const { error } = await blockUser('user-1', 'user-2');
    expect(error).toMatch(NOT_AVAILABLE_COPY);
  });

  it('returns a friendly message for other errors', async () => {
    mockInsertResult({ message: 'network failure' });
    const { error } = await blockUser('user-1', 'user-2');
    expect(error).toMatch(/Couldn’t block/);
  });
});

describe('block visibility invariants', () => {
  it('filters blocked owners from every actor-owned product surface', () => {
    const blockedIds = new Set(['blocked-user']);
    const surfaces = [
      { surface: 'profiles', actor: 'blocked-user' },
      { surface: 'people', actor: 'blocked-user' },
      { surface: 'map', actor: 'blocked-user' },
      { surface: 'jobs', actor: 'blocked-user' },
      { surface: 'events', actor: 'blocked-user' },
      { surface: 'channel chat', actor: 'blocked-user' },
      { surface: 'mentorship', actor: 'blocked-user' },
      { surface: 'notifications/navigation', actor: 'blocked-user' },
      { surface: 'own content', actor: 'viewer' },
    ];

    expect(filterBlockedActors(surfaces, blockedIds, (row) => row.actor)).toEqual([
      { surface: 'own content', actor: 'viewer' },
    ]);
  });

  it('rejects realtime content from a blocked sender', () => {
    const blockedIds = new Set(['blocked-user']);
    expect(canShowActorContent('blocked-user', blockedIds)).toBe(false);
    expect(canShowActorContent('visible-user', blockedIds)).toBe(true);
  });

  it('unblocking restores visibility immutably', () => {
    const blocked = applyBlockListChange(new Set<string>(), {
      blockedId: 'member-2',
      blocked: true,
    });
    const unblocked = applyBlockListChange(blocked, {
      blockedId: 'member-2',
      blocked: false,
    });

    expect(blocked).toEqual(new Set(['member-2']));
    expect(unblocked).toEqual(new Set());
    expect(canShowActorContent('member-2', unblocked)).toBe(true);
  });

  it('publishes successful local block and unblock changes to mounted surfaces', async () => {
    const changes: unknown[] = [];
    const unsubscribe = subscribeToBlockListChanges((change) => changes.push(change));

    mockInsertResult(null);
    await blockUser('viewer', 'member-2');

    const eqBlockedId = jest.fn(async () => ({ error: null }));
    const eqBlockerId = jest.fn(() => ({ eq: eqBlockedId }));
    mockedFrom.mockReturnValue({ delete: jest.fn(() => ({ eq: eqBlockerId })) });
    await unblockUser('viewer', 'member-2');
    unsubscribe();

    expect(changes).toEqual([
      { blockerId: 'viewer', blockedId: 'member-2', blocked: true },
      { blockerId: 'viewer', blockedId: 'member-2', blocked: false },
    ]);
  });
});

describe('fetchBlockedIds', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function mockSelectResult(result: { data: unknown; error: unknown }) {
    const eq = jest
      .fn<() => Promise<{ data: unknown; error: unknown }>>()
      .mockResolvedValue(result);
    mockedFrom.mockReturnValue({ select: jest.fn(() => ({ eq })) });
  }

  it('returns the blocked ids as a Set', async () => {
    mockSelectResult({
      data: [{ blocked_id: 'user-2' }, { blocked_id: 'user-3' }],
      error: null,
    });
    const ids = await fetchBlockedIds('user-1');
    expect(ids).toEqual(new Set(['user-2', 'user-3']));
  });

  it('returns an empty Set on query error (e.g. table missing)', async () => {
    mockSelectResult({
      data: null,
      error: { message: 'relation "user_blocks" does not exist' },
    });
    await expect(fetchBlockedIds('user-1')).resolves.toEqual(new Set());
  });

  it('returns an empty Set when the query throws', async () => {
    mockedFrom.mockImplementation(() => {
      throw new Error('network down');
    });
    await expect(fetchBlockedIds('user-1')).resolves.toEqual(new Set());
  });
});
