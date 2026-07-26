import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';
import { useAuth } from './auth';
import type { Event, EventCategory, RsvpStatus } from './types';

// Event calendar data layer (V2 flagship). Backed by the `events` and
// `event_rsvps` tables from supabase/migrations/app-v3-events.sql. Both may
// not exist in the live DB yet, so every call degrades gracefully — an empty
// calendar / friendly message, never a raw Postgres error.

/** True for "relation does not exist" — the events migration hasn't run. */
function isMissingTable(message: string): boolean {
  return /does not exist|schema cache/i.test(message);
}

const NOT_SET_UP = 'Events are not set up yet — run the events migration.';

export const EVENT_CATEGORIES: readonly { value: EventCategory; label: string }[] = [
  { value: 'chapter', label: 'Chapter' },
  { value: 'alumni', label: 'Alumni' },
  { value: 'philanthropy', label: 'Philanthropy' },
  { value: 'social', label: 'Social' },
  { value: 'recruitment', label: 'Recruitment' },
] as const;

/** An event enriched with RSVP info for list rendering. */
export interface EventWithMeta extends Event {
  goingCount: number;
  /** The signed-in user's RSVP, or null if they haven't responded. */
  myStatus: RsvpStatus | null;
}

/** The slice of the creator's profile the detail screen renders. */
export interface EventCreator {
  id: string;
  user_id: string;
  name: string | null;
  avatar_url: string | null;
}

interface RsvpRow {
  event_id: string;
  user_id: string;
  status: RsvpStatus;
}

/**
 * One batched RSVP fetch for a set of events → per-event going counts and the
 * viewer's own status. Returns zeros/nulls on any error (including the table
 * not existing yet) so callers can always render.
 */
async function fetchRsvpMeta(
  eventIds: string[],
  userId: string | null,
): Promise<Map<string, { goingCount: number; myStatus: RsvpStatus | null }>> {
  const meta = new Map<string, { goingCount: number; myStatus: RsvpStatus | null }>();
  for (const id of eventIds) meta.set(id, { goingCount: 0, myStatus: null });
  if (eventIds.length === 0) return meta;

  try {
    const { data, error } = await supabase
      .from('event_rsvps')
      .select('event_id, user_id, status')
      .in('event_id', eventIds);
    if (error || !data) return meta;

    for (const row of data as RsvpRow[]) {
      const entry = meta.get(row.event_id);
      if (!entry) continue;
      if (row.status === 'going') entry.goingCount += 1;
      if (userId && row.user_id === userId) entry.myStatus = row.status;
    }
  } catch {
    // Pre-migration or transient failure — counts stay at zero.
  }
  return meta;
}

export interface EventsData {
  loading: boolean;
  error: string | null;
  events: EventWithMeta[];
  reload: () => void;
}

/**
 * Upcoming events for a chapter (starts_at ≥ now − 1 day, soonest first),
 * each carrying its going count and the viewer's own RSVP status.
 */
export function useEvents(chapterId: string | null): EventsData {
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [events, setEvents] = useState<EventWithMeta[]>([]);
  const [nonce, setNonce] = useState(0);
  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!chapterId) {
      setLoading(false);
      return;
    }
    let mounted = true;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        // Include events that started within the last day so tonight's
        // in-progress event doesn't vanish the moment it starts.
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { data, error: err } = await supabase
          .from('events')
          .select('*')
          .eq('chapter_id', chapterId)
          .gte('starts_at', since)
          .order('starts_at', { ascending: true });

        if (!mounted) return;
        if (err) {
          // Pre-migration: show an empty calendar, not a Postgres error.
          if (isMissingTable(err.message)) {
            setEvents([]);
          } else {
            setError('Couldn’t load events. Pull to refresh.');
          }
          setLoading(false);
          return;
        }

        const rows = (data as Event[]) ?? [];
        const meta = await fetchRsvpMeta(
          rows.map((e) => e.id),
          userId,
        );
        if (!mounted) return;
        setEvents(
          rows.map((e) => ({
            ...e,
            goingCount: meta.get(e.id)?.goingCount ?? 0,
            myStatus: meta.get(e.id)?.myStatus ?? null,
          })),
        );
        setLoading(false);
      } catch {
        if (!mounted) return;
        setError('Couldn’t load events. Pull to refresh.');
        setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [chapterId, userId, nonce]);

  return { loading, error, events, reload };
}

export interface EventDetail {
  loading: boolean;
  error: string | null;
  event: Event | null;
  goingCount: number;
  maybeCount: number;
  myStatus: RsvpStatus | null;
  creator: EventCreator | null;
  reload: () => void;
}

/** One event + RSVP counts + the viewer's own status + the creator's profile. */
export function useEvent(eventId: string | null, userId: string | null): EventDetail {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [event, setEvent] = useState<Event | null>(null);
  const [goingCount, setGoingCount] = useState(0);
  const [maybeCount, setMaybeCount] = useState(0);
  const [myStatus, setMyStatus] = useState<RsvpStatus | null>(null);
  const [creator, setCreator] = useState<EventCreator | null>(null);
  const [nonce, setNonce] = useState(0);
  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!eventId) {
      setLoading(false);
      return;
    }
    let mounted = true;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const { data, error: err } = await supabase
          .from('events')
          .select('*')
          .eq('id', eventId)
          .maybeSingle();

        if (!mounted) return;
        if (err) {
          if (!isMissingTable(err.message)) {
            setError('Couldn’t load this event. Please try again.');
          }
          setEvent(null);
          setLoading(false);
          return;
        }

        const row = (data as Event) ?? null;
        setEvent(row);
        if (!row) {
          setLoading(false);
          return;
        }

        // RSVPs and creator profile in parallel; both are non-fatal extras.
        const [rsvps, creatorRes] = await Promise.all([
          (async (): Promise<RsvpRow[]> => {
            try {
              const res = await supabase
                .from('event_rsvps')
                .select('event_id, user_id, status')
                .eq('event_id', row.id);
              return res.error ? [] : ((res.data as RsvpRow[]) ?? []);
            } catch {
              return [];
            }
          })(),
          (async (): Promise<EventCreator | null> => {
            try {
              const res = await supabase
                .from('profiles')
                .select('id, user_id, name, avatar_url')
                .eq('user_id', row.created_by)
                .maybeSingle();
              return res.error ? null : ((res.data as EventCreator) ?? null);
            } catch {
              return null;
            }
          })(),
        ]);

        if (!mounted) return;
        setGoingCount(rsvps.filter((r) => r.status === 'going').length);
        setMaybeCount(rsvps.filter((r) => r.status === 'maybe').length);
        setMyStatus(
          userId ? (rsvps.find((r) => r.user_id === userId)?.status ?? null) : null,
        );
        setCreator(creatorRes);
        setLoading(false);
      } catch {
        if (!mounted) return;
        setError('Couldn’t load this event. Please try again.');
        setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [eventId, userId, nonce]);

  return { loading, error, event, goingCount, maybeCount, myStatus, creator, reload };
}

/** Create an event in the caller's chapter. RLS pins chapter_id/created_by. */
export async function createEvent(input: {
  chapterId: string;
  createdBy: string;
  title: string;
  category: EventCategory;
  startsAt: string;
  endsAt?: string | null;
  location?: string;
  description?: string;
}): Promise<{ error: string | null }> {
  try {
    const { error } = await supabase.from('events').insert({
      chapter_id: input.chapterId,
      created_by: input.createdBy,
      title: input.title,
      category: input.category,
      starts_at: input.startsAt,
      ends_at: input.endsAt || null,
      location: input.location || null,
      description: input.description || null,
    });
    if (!error) return { error: null };
    return {
      error: isMissingTable(error.message)
        ? NOT_SET_UP
        : 'Couldn’t create the event. Please try again.',
    };
  } catch {
    return { error: 'Couldn’t create the event. Please try again.' };
  }
}

/** Set (or change) the caller's RSVP — upserts on the (event_id, user_id) pk. */
export async function rsvp(
  eventId: string,
  userId: string,
  status: RsvpStatus,
): Promise<{ error: string | null }> {
  try {
    const { error } = await supabase
      .from('event_rsvps')
      .upsert(
        { event_id: eventId, user_id: userId, status },
        { onConflict: 'event_id,user_id' },
      );
    if (!error) return { error: null };
    return {
      error: isMissingTable(error.message)
        ? NOT_SET_UP
        : 'Couldn’t save your RSVP. Please try again.',
    };
  } catch {
    return { error: 'Couldn’t save your RSVP. Please try again.' };
  }
}

/** Delete an event. RLS allows only the creator or a chapter admin. */
export async function deleteEvent(id: string): Promise<{ error: string | null }> {
  try {
    const { error } = await supabase.from('events').delete().eq('id', id);
    if (!error) return { error: null };
    return {
      error: isMissingTable(error.message)
        ? NOT_SET_UP
        : 'Couldn’t delete the event. Please try again.',
    };
  } catch {
    return { error: 'Couldn’t delete the event. Please try again.' };
  }
}

// ── Display helpers (shared by the agenda list + detail screen) ──────────────

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Day header label: "Today", "Tomorrow", or "Mon, Aug 3". */
export function eventDayLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const diffDays = Math.round((startOfDay(d) - startOfDay(new Date())) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

/** Local-date key ("2026-08-03") for grouping events into day sections. */
export function eventDayKey(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}
