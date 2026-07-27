import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { Mock } from 'jest-mock';
import { fetchJobsPage, isMissingIsOpen } from '../../lib/jobs';
import { supabase } from '../../lib/supabase';

jest.mock('../../lib/supabase', () => ({
  supabase: { from: jest.fn() },
  supabaseConfigError: null,
}));

const mockedFrom = supabase.from as unknown as Mock<(table: string) => unknown>;

type QueryResult = { data: unknown; error: { message: string } | null };

/**
 * Chainable PostgREST query-builder stub. Every filter/order call returns the
 * builder; `.limit()` resolves with the next result in `results` (one result
 * per `supabase.from()` call, i.e. per query attempt). Returns the builders
 * so tests can assert which attempt applied the `.or()` is_open filter.
 */
function mockQueryAttempts(results: QueryResult[]) {
  const builders: Record<string, Mock>[] = [];
  let attempt = 0;
  mockedFrom.mockImplementation(() => {
    const result = results[Math.min(attempt, results.length - 1)];
    attempt += 1;
    const builder: Record<string, Mock> = {};
    for (const method of ['select', 'eq', 'or', 'lt', 'order'] as const) {
      builder[method] = jest.fn(() => builder);
    }
    builder.limit = jest.fn(() => Promise.resolve(result)) as Mock;
    builders.push(builder);
    return builder;
  });
  return builders;
}

const JOB_ROWS = [
  { id: 'job-1', chapter_id: 'chapter-1', title: 'SDE', created_at: '2026-07-01' },
  { id: 'job-2', chapter_id: 'chapter-1', title: 'PM', created_at: '2026-06-01' },
];

describe('isMissingIsOpen', () => {
  it('matches the Postgres missing-column error', () => {
    expect(isMissingIsOpen('column "is_open" does not exist')).toBe(true);
    expect(isMissingIsOpen('column job_postings.is_open does not exist')).toBe(true);
  });

  it('matches the PostgREST schema-cache variant', () => {
    expect(
      isMissingIsOpen("Could not find the 'is_open' column of 'job_postings' in the schema cache"),
    ).toBe(true);
  });

  it('does not match unrelated errors', () => {
    expect(isMissingIsOpen('permission denied for table job_postings')).toBe(false);
    expect(isMissingIsOpen('network failure')).toBe(false);
  });
});

describe('fetchJobsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns the page when the is_open-filtered query succeeds', async () => {
    const builders = mockQueryAttempts([{ data: JOB_ROWS, error: null }]);
    const { page, error } = await fetchJobsPage('chapter-1', null);
    expect(error).toBeNull();
    expect(page).toEqual(JOB_ROWS);
    expect(mockedFrom).toHaveBeenCalledTimes(1);
    expect(mockedFrom).toHaveBeenCalledWith('job_postings');
    // First attempt filters to open jobs (null is_open counts as open).
    expect(builders[0].or).toHaveBeenCalledWith('is_open.is.null,is_open.eq.true');
  });

  it('retries unfiltered when is_open does not exist yet (pre-migration)', async () => {
    const builders = mockQueryAttempts([
      { data: null, error: { message: 'column "is_open" does not exist' } },
      { data: JOB_ROWS, error: null },
    ]);
    const { page, error } = await fetchJobsPage('chapter-1', null);
    expect(error).toBeNull();
    expect(page).toEqual(JOB_ROWS);
    expect(mockedFrom).toHaveBeenCalledTimes(2);
    // The retry must not re-apply the is_open filter.
    expect(builders[0].or).toHaveBeenCalledTimes(1);
    expect(builders[1].or).not.toHaveBeenCalled();
  });

  it('does not retry on unrelated errors and surfaces the error', async () => {
    mockQueryAttempts([
      { data: null, error: { message: 'permission denied for table job_postings' } },
    ]);
    const { page, error } = await fetchJobsPage('chapter-1', null);
    expect(mockedFrom).toHaveBeenCalledTimes(1);
    expect(page).toEqual([]);
    expect(error).toMatch(/permission denied/);
  });

  it('surfaces the error when the unfiltered retry also fails', async () => {
    mockQueryAttempts([
      { data: null, error: { message: 'column "is_open" does not exist' } },
      { data: null, error: { message: 'network failure' } },
    ]);
    const { page, error } = await fetchJobsPage('chapter-1', null);
    expect(mockedFrom).toHaveBeenCalledTimes(2);
    expect(page).toEqual([]);
    expect(error).toBe('network failure');
  });

  it('applies the created_at cursor when paginating', async () => {
    const builders = mockQueryAttempts([{ data: [], error: null }]);
    await fetchJobsPage('chapter-1', '2026-06-01');
    expect(builders[0].lt).toHaveBeenCalledWith('created_at', '2026-06-01');
  });

  it('omits the cursor on the first page', async () => {
    const builders = mockQueryAttempts([{ data: [], error: null }]);
    await fetchJobsPage('chapter-1', null);
    expect(builders[0].lt).not.toHaveBeenCalled();
  });

  it('returns an empty page when data is null with no error', async () => {
    mockQueryAttempts([{ data: null, error: null }]);
    await expect(fetchJobsPage('chapter-1', null)).resolves.toEqual({
      page: [],
      error: null,
    });
  });
});
