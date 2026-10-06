import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useMemberScope, useScopedRead } from './scoped-read';
import { eventPhase } from './time';
import { supabase } from './supabase';
import { useAuth } from './auth';
import { canShowActorContent, filterBlockedActors } from './moderation';
import type { Event, EventCategory, RsvpStatus } from './types';

// Event calendar data layer (V2 flagship). Backed by the `events` and
// `event_rsvps` tables from supabase/migrations/app-v3-events.sql. Both may
// be unavailable; failed reads remain explicit and retryable.

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

export interface EventCreator {
  id: string;
  user_id: string;
  name: string | null;
  avatar_url: string | null;
}
export interface RsvpMeta {
  goingCount: number | null;
  maybeCount: number | null;
  myStatus: RsvpStatus | null | undefined;
  attendees: EventCreator[];
  metaError: string | null;
}
export interface EventWithMeta extends Event, RsvpMeta {}
const UNKNOWN: RsvpMeta = {
  goingCount: null,
  maybeCount: null,
  myStatus: undefined,
  attendees: [],
  metaError: null,
};
export const EVENT_COLUMNS =
  'id, chapter_id, created_by, title, description, location, category, starts_at, ends_at, created_at';

/** Counts describe only RSVPs visible under RLS, never a chapter-wide total.
 * Exact head counts avoid PostgREST's row cap. Preview selects four IDs only;
 * approved chapter profiles and symmetric-block RLS can further reduce it. */
export async function fetchRsvpMeta(
  eventId: string,
  userId: string,
  chapterId: string,
): Promise<RsvpMeta> {
  const [going, maybe, mine, preview] = await Promise.all([
    supabase
      .from('event_rsvps')
      .select('user_id', { count: 'exact', head: true })
      .eq('event_id', eventId)
      .eq('status', 'going'),
    supabase
      .from('event_rsvps')
      .select('user_id', { count: 'exact', head: true })
      .eq('event_id', eventId)
      .eq('status', 'maybe'),
    supabase
      .from('event_rsvps')
      .select('status')
      .eq('event_id', eventId)
      .eq('user_id', userId)
      .maybeSingle(),
    supabase
      .from('event_rsvps')
      .select('user_id')
      .eq('event_id', eventId)
      .eq('status', 'going')
      .order('user_id')
      .limit(4),
  ]);
  if (going.error || maybe.error || mine.error || going.count == null || maybe.count == null)
    throw new Error('RSVP unavailable');
  let attendees: EventCreator[] = [];
  let metaError = preview.error ? 'Attendee preview unavailable. Retry to refresh.' : null;
  if (!preview.error && preview.data?.length) {
    const result = await supabase
      .from('profiles')
      .select('id, user_id, name, avatar_url')
      .eq('chapter_id', chapterId)
      .eq('status', 'approved')
      .in(
        'user_id',
        preview.data.map((r) => r.user_id),
      )
      .limit(4);
    if (result.error) metaError = 'Attendee preview unavailable. Retry to refresh.';
    else attendees = result.data ?? [];
  }
  return {
    goingCount: going.count,
    maybeCount: maybe.count,
    myStatus: mine.data?.status ?? null,
    attendees,
    metaError,
  };
}

export function useEvents(chapterId: string | null) {
  const { session, profile, blockedIds } = useAuth();
  const scope = useMemberScope();
  const read = useCallback(
    async (previous: EventWithMeta[] | null) => {
      const now = new Date().toISOString();
      const result = await supabase
        .from('events')
        .select(EVENT_COLUMNS)
        .eq('chapter_id', chapterId!)
        .or(`starts_at.gt.${now},ends_at.gt.${now}`)
        .order('starts_at')
        .order('id')
        .limit(100);
      if (result.error || !result.data) throw new Error('events unavailable');
      return await Promise.all(
        filterBlockedActors(result.data as Event[], blockedIds, (e) => e.created_by).map(
          async (event) => {
            try {
              return { ...event, ...(await fetchRsvpMeta(event.id, session!.user.id, chapterId!)) };
            } catch {
              return {
                ...event,
                ...(previous?.find((e) => e.id === event.id) ?? UNKNOWN),
                ...event,
                metaError: 'Attendance unavailable. Retry to refresh.',
              };
            }
          },
        ),
      );
    },
    [chapterId, session, blockedIds],
  );
  const result = useScopedRead(
    `${scope}:events:${chapterId}`,
    !!chapterId && profile?.status === 'approved',
    read,
    'Couldn’t load events. Please retry.',
  );
  const now = useEventClock(result.data ?? []);
  const events = (result.data ?? []).filter((e) => eventPhase(e, now) !== 'Ended');
  return {
    ...result,
    events,
    error:
      result.error ??
      (events.some((e) => e.metaError)
        ? 'Some attendance information is unavailable. Please retry.'
        : null),
  };
}

/** Wake at exact start/end boundaries, with a periodic fallback for clock changes. */
export function useEventClock(events: { starts_at: string; ends_at?: string | null }[]) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const wake = () => setNow(Date.now());
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') wake();
    });
    globalThis.addEventListener?.('focus', wake);
    return () => {
      appState.remove();
      globalThis.removeEventListener?.('focus', wake);
    };
  }, []);
  const boundaries = events.flatMap((e) => [
    Date.parse(e.starts_at),
    e.ends_at ? Date.parse(e.ends_at) : NaN,
  ]);
  const next = Math.min(...boundaries.filter((t) => t > now));
  useEffect(() => {
    const timer = setTimeout(
      () => setNow(Date.now()),
      Math.min(60000, Math.max(1, next - Date.now())),
    );
    return () => clearTimeout(timer);
  }, [next, now]);
  return now;
}

export function useEvent(
  eventId: string | null,
  userId: string | null,
  blockedIds: ReadonlySet<string>,
) {
  const { profile } = useAuth();
  const scope = useMemberScope();
  const read = useCallback(
    async (
      previous: { event: Event | null; meta: RsvpMeta; creator: EventCreator | null } | null,
    ) => {
      const result = await supabase
        .from('events')
        .select(EVENT_COLUMNS)
        .eq('id', eventId!)
        .eq('chapter_id', profile!.chapter_id!)
        .maybeSingle();
      if (result.error) throw new Error('event unavailable');
      const event =
        result.data && canShowActorContent(result.data.created_by, blockedIds)
          ? (result.data as Event)
          : null;
      if (!event) return { event: null, meta: UNKNOWN, creator: null };
      const [metaResult, creatorResult] = await Promise.allSettled([
        fetchRsvpMeta(event.id, userId!, event.chapter_id),
        supabase
          .from('profiles')
          .select('id, user_id, name, avatar_url')
          .eq('user_id', event.created_by)
          .eq('status', 'approved')
          .maybeSingle(),
      ]);
      const meta =
        metaResult.status === 'fulfilled'
          ? {
              ...metaResult.value,
              attendees: metaResult.value.metaError
                ? (previous?.meta.attendees ?? [])
                : metaResult.value.attendees,
            }
          : {
              ...(previous?.meta ?? UNKNOWN),
              metaError: 'Attendance unavailable. Retry to refresh.',
            };
      return {
        event,
        meta,
        creator:
          creatorResult.status === 'fulfilled' && !creatorResult.value.error
            ? (creatorResult.value.data as EventCreator)
            : (previous?.creator ?? null),
      };
    },
    [eventId, userId, blockedIds, profile],
  );
  const result = useScopedRead(
    `${scope}:event:${eventId}:${userId}`,
    !!eventId && !!userId && profile?.status === 'approved',
    read,
    'Couldn’t load this event. Please retry.',
  );
  const [save, setSave] = useState<{
    token: typeof result.token;
    busy: boolean;
    error: string | null;
  }>();
  const busy = useRef(false);
  const saveRsvp = async (status: RsvpStatus) => {
    const token = result.token;
    if (!token.active || busy.current || !result.data?.event || !userId) return;
    busy.current = true;
    result.invalidate();
    setSave({ token, busy: true, error: null });
    const outcome = await rsvp(eventId!, userId, status, () => token.active);
    busy.current = false;
    if (!token.active) return;
    const latest = token.data;
    if (!outcome.error && latest?.event?.id === eventId) {
      // The acknowledged response is authoritative; counts come only from
      // reads. Never derive a new count from a potentially stale snapshot.
      result.update({
        ...latest,
        meta: {
          ...latest.meta,
          myStatus: status,
          metaError: 'Your response is confirmed. Refreshing attendance.',
        },
      });
    }
    setSave({ token, busy: false, error: outcome.error });
    result.reload();
  };
  return {
    ...result,
    event: result.data?.event ?? null,
    creator: result.data?.creator ?? null,
    ...(result.data?.meta ?? UNKNOWN),
    saving: save?.token === result.token && save.busy,
    saveError: save?.token === result.token ? save.error : null,
    saveRsvp,
  };
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
      error: isMissingTable(error?.message ?? '')
        ? NOT_SET_UP
        : 'Couldn’t create the event. Please try again.',
    };
  } catch {
    return { error: 'Couldn’t create the event. Please try again.' };
  }
}

// A process-wide lock also serializes a remounted detail screen while a write
// is outstanding. Unlike message INSERTs, an RSVP retries an existing mutable key.
const rsvpWrites = new Set<string>();
export async function rsvp(
  eventId: string,
  userId: string,
  status: RsvpStatus,
  current: () => boolean = () => true,
): Promise<{ error: string | null }> {
  if (!current()) return { error: 'This RSVP session has ended.' };
  const key = `${userId}:${eventId}`;
  if (rsvpWrites.has(key)) return { error: 'Your RSVP is still saving. Please wait, then retry.' };
  rsvpWrites.add(key);
  let writeError: { message: string } | null = null;
  try {
    try {
      const result = await supabase
        .from('event_rsvps')
        .upsert({ event_id: eventId, user_id: userId, status }, { onConflict: 'event_id,user_id' })
        .select('event_id, user_id, status')
        .maybeSingle();
      if (!current()) return { error: 'This RSVP session has ended.' };
      writeError = result.error;
      if (
        !result.error &&
        result.data?.event_id === eventId &&
        result.data.user_id === userId &&
        result.data.status === status
      )
        return { error: null };
    } catch {
      /* An empty/lost acknowledgment is uncertain, not success. */
    }
    if (!current()) return { error: 'This RSVP session has ended.' };
    const check = await supabase
      .from('event_rsvps')
      .select('status')
      .eq('event_id', eventId)
      .eq('user_id', userId)
      .maybeSingle();
    if (!current()) return { error: 'This RSVP session has ended.' };
    if (!check.error && check.data?.status === status) return { error: null };
    return {
      error:
        writeError && isMissingTable(writeError.message)
          ? NOT_SET_UP
          : 'Couldn’t save your RSVP with confirmation. Retry to check attendance, then choose your response again.',
    };
  } catch {
    return {
      error:
        'Couldn’t save your RSVP with confirmation. Retry to check attendance before trying again.',
    };
  } finally {
    rsvpWrites.delete(key);
  }
}

/**
 * Update an event's editable fields. RLS allows only the creator or a chapter
 * admin (same policy as delete). Pass snake_case column names.
 */
export async function updateEvent(
  eventId: string,
  fields: Partial<{
    title: string;
    category: EventCategory;
    starts_at: string;
    ends_at: string | null;
    location: string | null;
    description: string | null;
  }>,
): Promise<{ error: string | null }> {
  try {
    const { data, error } = await supabase
      .from('events')
      .update(fields)
      .eq('id', eventId)
      .select('id')
      .maybeSingle();
    if (!error && data?.id === eventId) return { error: null };
    return {
      error: isMissingTable(error?.message ?? '')
        ? NOT_SET_UP
        : 'Couldn’t save your changes. Please try again.',
    };
  } catch {
    return { error: 'Couldn’t save your changes. Please try again.' };
  }
}

/** Delete an event. RLS allows only the creator or a chapter admin. */
export async function deleteEvent(id: string): Promise<{ error: string | null }> {
  try {
    const { data, error } = await supabase
      .from('events')
      .delete()
      .eq('id', id)
      .select('id')
      .maybeSingle();
    if (!error && data?.id === id) return { error: null };
    return {
      error: isMissingTable(error?.message ?? '')
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
