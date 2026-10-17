import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { Mock } from 'jest-mock';
import { createEvent, deleteEvent, eventDayKey, eventDayLabel, rsvp } from '../../lib/events';
import { supabase } from '../../lib/supabase';

jest.mock('../../lib/auth', () => ({ useAuth: jest.fn() }));

jest.mock('../../lib/supabase', () => ({
  supabase: { from: jest.fn() },
  supabaseConfigError: null,
}));

const mockedFrom = supabase.from as unknown as Mock<(table: string) => unknown>;

/** Friendly copy shown when the events migration hasn't run yet. */
const NOT_SET_UP_COPY = /not set up yet/;

type WriteResult = { error: { message: string } | null };

function mockInsertResult(error: { message: string } | null) {
  const insert = jest.fn<() => Promise<WriteResult>>().mockResolvedValue({ error });
  mockedFrom.mockReturnValue({ insert });
}

function mockUpdateResult(error: { message: string } | null) {
  const result = {
    data: error ? null : { event_id: 'event-1', user_id: 'user-1', status: 'going' },
    error,
  };
  const query: any = {};
  query.select = jest.fn(() => query);
  query.eq = jest.fn(() => query);
  query.maybeSingle = jest.fn(async () => result);
  const update = jest.fn(() => query);
  mockedFrom.mockReturnValue({ update, select: query.select });
  return update;
}

function mockDeleteResult(error: { message: string } | null) {
  const query: any = {};
  query.eq = jest.fn(() => query);
  query.select = jest.fn(() => query);
  query.maybeSingle = jest.fn(async () => ({ data: error ? null : { id: 'event-1' }, error }));
  mockedFrom.mockReturnValue({ delete: jest.fn(() => query) });
}

describe('createEvent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const input = {
    chapterId: 'chapter-1',
    createdBy: 'user-1',
    title: 'Founders Day',
    category: 'chapter' as const,
    startsAt: '2026-08-03T18:00:00.000Z',
  };

  it('returns no error on success', async () => {
    mockInsertResult(null);
    await expect(createEvent(input)).resolves.toEqual({ error: null });
    expect(mockedFrom).toHaveBeenCalledWith('events');
  });

  it('maps missing-table errors to the friendly copy, not raw Postgres text', async () => {
    mockInsertResult({ message: 'relation "events" does not exist' });
    const { error } = await createEvent(input);
    expect(error).toMatch(NOT_SET_UP_COPY);
    expect(error).not.toMatch(/relation|does not exist/);
  });

  it('maps schema-cache errors (PostgREST variant of missing table) the same way', async () => {
    mockInsertResult({
      message: "Could not find the table 'events' in the schema cache",
    });
    const { error } = await createEvent(input);
    expect(error).toMatch(NOT_SET_UP_COPY);
  });

  it('returns a generic friendly message for other errors', async () => {
    mockInsertResult({ message: 'permission denied for table events' });
    const { error } = await createEvent(input);
    expect(error).toMatch(/Couldn’t create the event/);
    expect(error).not.toMatch(/permission denied/);
  });

  it('returns a friendly message when the client throws', async () => {
    mockedFrom.mockImplementation(() => {
      throw new Error('network down');
    });
    const { error } = await createEvent(input);
    expect(error).toMatch(/Couldn’t create the event/);
  });
});

describe('rsvp', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('updates only status and filters by both RSVP keys', async () => {
    const update = mockUpdateResult(null);
    await expect(rsvp('event-1', 'user-1', 'going')).resolves.toEqual({ error: null });
    expect(mockedFrom).toHaveBeenCalledWith('event_rsvps');
    expect(update).toHaveBeenCalledWith({ status: 'going' });
    const query = (update.mock.results[0] as any).value;
    expect(query.eq).toHaveBeenCalledWith('event_id', 'event-1');
    expect(query.eq).toHaveBeenCalledWith('user_id', 'user-1');
  });

  it.each([false, true])(
    'inserts a first response and recovers a concurrent insert: %s',
    async (conflict) => {
      const row = { event_id: 'event-1', user_id: 'user-1', status: 'maybe' };
      const query: any = {};
      for (const method of ['select', 'eq']) query[method] = jest.fn(() => query);
      query.maybeSingle = jest
        .fn<any>()
        .mockResolvedValueOnce({ data: null, error: null })
        .mockResolvedValueOnce(
          conflict
            ? { data: null, error: { code: '23505', message: 'duplicate key' } }
            : { data: row, error: null },
        )
        .mockResolvedValueOnce({ data: row, error: null });
      const update = jest.fn(() => query);
      const insert = jest.fn(() => query);
      mockedFrom.mockReturnValue({ update, insert });
      await expect(rsvp('event-1', 'user-1', 'maybe')).resolves.toEqual({ error: null });
      expect(insert).toHaveBeenCalledWith(row);
      expect(update).toHaveBeenCalledTimes(conflict ? 2 : 1);
      for (const args of update.mock.calls) expect(args).toEqual([{ status: 'maybe' }]);
    },
  );

  it('does not insert or reconcile after the session ends during the initial update', async () => {
    let active = true;
    const query: any = {};
    for (const method of ['select', 'eq']) query[method] = jest.fn(() => query);
    query.maybeSingle = jest.fn(async () => {
      active = false;
      return { data: null, error: null };
    });
    const insert = jest.fn(() => query);
    mockedFrom.mockReturnValue({ update: jest.fn(() => query), insert });
    await expect(rsvp('event-1', 'user-1', 'going', () => active)).resolves.toMatchObject({
      error: expect.stringMatching(/session has ended/),
    });
    expect(insert).not.toHaveBeenCalled();
    expect(mockedFrom).toHaveBeenCalledTimes(1);
  });

  it('maps missing-table errors to the friendly copy', async () => {
    mockUpdateResult({ message: 'relation "event_rsvps" does not exist' });
    const { error } = await rsvp('event-1', 'user-1', 'maybe');
    expect(error).toMatch(NOT_SET_UP_COPY);
    expect(error).not.toMatch(/relation|does not exist/);
  });

  it('returns a generic friendly message for other errors', async () => {
    mockUpdateResult({ message: 'new row violates row-level security policy' });
    const { error } = await rsvp('event-1', 'user-1', 'declined');
    expect(error).toMatch(/Couldn’t save your RSVP/);
    expect(error).not.toMatch(/row-level security/);
  });

  it('returns a friendly message when the client throws', async () => {
    mockedFrom.mockImplementation(() => {
      throw new Error('network down');
    });
    const { error } = await rsvp('event-1', 'user-1', 'going');
    expect(error).toMatch(/Couldn’t save your RSVP/);
  });
});

describe('deleteEvent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns no error on success', async () => {
    mockDeleteResult(null);
    await expect(deleteEvent('event-1')).resolves.toEqual({ error: null });
    expect(mockedFrom).toHaveBeenCalledWith('events');
  });

  it('maps missing-table errors to the friendly copy', async () => {
    mockDeleteResult({ message: 'relation "events" does not exist' });
    const { error } = await deleteEvent('event-1');
    expect(error).toMatch(NOT_SET_UP_COPY);
  });

  it('returns a generic friendly message for other errors', async () => {
    mockDeleteResult({ message: 'permission denied for table events' });
    const { error } = await deleteEvent('event-1');
    expect(error).toMatch(/Couldn’t delete the event/);
    expect(error).not.toMatch(/permission denied/);
  });
});

describe('eventDayLabel', () => {
  /** Noon local time `offsetDays` from today — immune to DST hour shifts. */
  function localNoon(offsetDays: number): string {
    const now = new Date();
    return new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + offsetDays,
      12,
    ).toISOString();
  }

  it('labels today as "Today"', () => {
    expect(eventDayLabel(localNoon(0))).toBe('Today');
  });

  it('labels tomorrow as "Tomorrow"', () => {
    expect(eventDayLabel(localNoon(1))).toBe('Tomorrow');
  });

  it('labels other days with a formatted date, not Today/Tomorrow', () => {
    const label = eventDayLabel(localNoon(5));
    expect(label).not.toBe('Today');
    expect(label).not.toBe('Tomorrow');
    expect(label.length).toBeGreaterThan(0);
  });

  it('returns an empty string for invalid dates', () => {
    expect(eventDayLabel('not-a-date')).toBe('');
  });
});

describe('eventDayKey', () => {
  it('formats a local date as YYYY-MM-DD with zero padding', () => {
    // Local-time constructor so the key is timezone-independent.
    const iso = new Date(2026, 7, 3, 12).toISOString(); // Aug 3, 2026, local noon
    expect(eventDayKey(iso)).toBe('2026-08-03');
  });

  it('groups two times on the same local day under one key', () => {
    const morning = new Date(2026, 11, 25, 8).toISOString();
    const evening = new Date(2026, 11, 25, 21).toISOString();
    expect(eventDayKey(morning)).toBe(eventDayKey(evening));
    expect(eventDayKey(morning)).toBe('2026-12-25');
  });

  it('returns an empty string for invalid dates', () => {
    expect(eventDayKey('not-a-date')).toBe('');
  });
});
