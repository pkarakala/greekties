import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { Mock } from 'jest-mock';
import {
  createEvent,
  deleteEvent,
  eventDayKey,
  eventDayLabel,
  rsvp,
} from '../../lib/events';
import { supabase } from '../../lib/supabase';

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

function mockUpsertResult(error: { message: string } | null) {
  const upsert = jest.fn<() => Promise<WriteResult>>().mockResolvedValue({ error });
  mockedFrom.mockReturnValue({ upsert });
  return upsert;
}

function mockDeleteResult(error: { message: string } | null) {
  const eq = jest.fn<() => Promise<WriteResult>>().mockResolvedValue({ error });
  mockedFrom.mockReturnValue({ delete: jest.fn(() => ({ eq })) });
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

  it('upserts on the (event_id, user_id) pk and returns no error on success', async () => {
    const upsert = mockUpsertResult(null);
    await expect(rsvp('event-1', 'user-1', 'going')).resolves.toEqual({ error: null });
    expect(mockedFrom).toHaveBeenCalledWith('event_rsvps');
    expect(upsert).toHaveBeenCalledWith(
      { event_id: 'event-1', user_id: 'user-1', status: 'going' },
      { onConflict: 'event_id,user_id' },
    );
  });

  it('maps missing-table errors to the friendly copy', async () => {
    mockUpsertResult({ message: 'relation "event_rsvps" does not exist' });
    const { error } = await rsvp('event-1', 'user-1', 'maybe');
    expect(error).toMatch(NOT_SET_UP_COPY);
    expect(error).not.toMatch(/relation|does not exist/);
  });

  it('returns a generic friendly message for other errors', async () => {
    mockUpsertResult({ message: 'new row violates row-level security policy' });
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
