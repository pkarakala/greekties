import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { Mock } from 'jest-mock';
import { reportContent, blockUser, fetchBlockedIds } from '../../lib/moderation';
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
