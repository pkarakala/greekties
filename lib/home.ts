import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';
import type { Chapter, Event, JobPosting, Profile } from './types';

export type ChapterIdentity = Pick<Chapter, 'name' | 'designation' | 'university'>;
export type HomeEvent = Pick<Event, 'id' | 'title' | 'location' | 'starts_at' | 'category'>;
export type HomeJob = Pick<JobPosting, 'id' | 'title' | 'company' | 'location'>;
export interface HomeConversation {
  content?: string;
  channel_id: string;
  created_at: string;
  channels: { name: string };
}

export function chapterIdentity(chapter: ChapterIdentity): string {
  return [chapter.name, chapter.designation, chapter.university].filter(Boolean).join(' · ');
}

/** Include authorization changes so cached channel activity cannot outlive access. */
export function memberScope(profile: Profile | null, userId: string | null): string | null {
  return userId &&
    profile?.user_id === userId &&
    profile.status === 'approved' &&
    profile.chapter_id
    ? JSON.stringify([userId, profile.chapter_id, profile.membership_type, profile.admin_role])
    : null;
}

export interface SectionRead<T> {
  data: T | undefined;
  loading: boolean;
  error: boolean;
  reload: () => void;
}

/** Same-scope refresh retains data. Scope changes hide it during render, before effects. */
export function useSectionRead<T>(scope: string | null, read: () => Promise<T>): SectionRead<T> {
  const [state, setState] = useState<{
    scope: string | null;
    data: T | undefined;
    loading: boolean;
    error: boolean;
  }>({ scope, data: undefined, loading: !!scope, error: false });
  const [revision, setRevision] = useState(0);
  const reload = useCallback(() => setRevision((value) => value + 1), []);
  useEffect(() => {
    let current = true;
    setState((previous) => ({
      scope,
      data: previous.scope === scope ? previous.data : undefined,
      loading: !!scope,
      error: false,
    }));
    if (scope) {
      void Promise.resolve()
        .then(read)
        .then(
          (data) => {
            if (current) setState({ scope, data, loading: false, error: false });
          },
          () => {
            if (current) setState((previous) => ({ ...previous, loading: false, error: true }));
          },
        );
    }
    return () => {
      current = false;
    };
  }, [scope, read, revision]);
  return {
    ...(state.scope === scope && scope
      ? state
      : { data: undefined, loading: !!scope, error: false }),
    reload,
  };
}

export function useChapterIdentity(scope: string | null, chapterId: string | null) {
  const read = useCallback(async () => {
    const { data, error } = await supabase
      .from('chapters')
      .select('name, designation, university')
      .eq('id', chapterId!)
      .maybeSingle();
    if (error || !data) throw new Error('Chapter unavailable');
    return data as ChapterIdentity;
  }, [chapterId]);
  return useSectionRead(scope, read);
}

export interface MembershipCounts {
  active: number;
  alumni: number;
}

/** Exact authorized totals: HEAD requests count every matching row under RLS. */
export async function fetchMembershipCounts(
  chapterId: string,
  blockedIds: ReadonlySet<string>,
): Promise<MembershipCounts> {
  const countMembers = async (membershipType: 'active' | 'alumni') => {
    let query = supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('chapter_id', chapterId)
      .eq('status', 'approved')
      .eq('membership_type', membershipType);
    for (const id of blockedIds) query = query.neq('user_id', id);
    const { count, error } = await query;
    // Missing count metadata is an unavailable read, never an empty chapter.
    if (error || typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0)
      throw new Error('Membership counts unavailable');
    return count;
  };
  const [active, alumni] = await Promise.all([countMembers('active'), countMembers('alumni')]);
  return { active, alumni };
}

export function useMembershipCounts(
  scope: string | null,
  chapterId: string | null,
  blockedIds: ReadonlySet<string>,
) {
  const blocked = [...blockedIds].sort().join(',');
  const contentScope = scope ? JSON.stringify([scope, chapterId, blocked]) : null;
  const read = useCallback(
    () => fetchMembershipCounts(chapterId!, new Set(blocked ? blocked.split(',') : [])),
    [chapterId, blocked],
  );
  return useSectionRead(contentScope, read);
}

export function useHomeOverview(
  scope: string | null,
  chapterId: string | null,
  blockedIds: ReadonlySet<string>,
) {
  // UUIDs originate from the existing authenticated block service, not user text.
  const blocked = [...blockedIds].sort().join(',');
  const contentScope = scope ? `${scope}:${blocked}` : null;
  const eventRead = useCallback(async () => {
    const now = new Date().toISOString();
    let query = supabase
      .from('events')
      .select('id, title, location, starts_at, category')
      .eq('chapter_id', chapterId!)
      .gt('starts_at', now)
      .or(`ends_at.is.null,ends_at.gt.${now}`);
    if (blocked) query = query.not('created_by', 'in', `(${blocked})`);
    const { data, error } = await query.order('starts_at', { ascending: true }).limit(1);
    if (error) throw error;
    return (data?.[0] as HomeEvent | undefined) ?? null;
  }, [chapterId, blocked]);
  const jobsRead = useCallback(async () => {
    let query = supabase
      .from('job_postings')
      .select('id, title, company, location')
      .eq('chapter_id', chapterId!)
      .or('is_open.is.null,is_open.eq.true');
    if (blocked) query = query.not('posted_by', 'in', `(${blocked})`);
    const { data, error } = await query.order('created_at', { ascending: false }).limit(2);
    if (error) throw error;
    return (data ?? []) as HomeJob[];
  }, [chapterId, blocked]);
  const conversationsRead = useCallback(async () => {
    // Both message and joined-channel RLS apply. No fabricated unread count or
    // channel-creation timestamp masquerading as conversation activity.
    let query = supabase
      .from('channel_messages')
      .select('channel_id, content, created_at, channels!inner(name, chapter_id)')
      .eq('channels.chapter_id', chapterId!);
    if (blocked) query = query.not('sender_id', 'in', `(${blocked})`);
    const { data, error } = await query.order('created_at', { ascending: false }).limit(1);
    if (error) throw error;
    const conversation = (data?.[0] as unknown as HomeConversation | undefined) ?? null;
    if (!conversation) return null;
    // Reuse the inbox's visibility contract before exposing message text. Admin
    // management SELECT access alone does not authorize a conversation preview.
    try {
      const access = await supabase.rpc('is_channel_visible', {
        p_channel_id: conversation.channel_id,
      });
      if (access?.data === false) return null;
      if (access?.error || access?.data !== true) return { ...conversation, content: undefined };
    } catch {
      return { ...conversation, content: undefined };
    }
    return conversation;
  }, [chapterId, blocked]);
  const event = useSectionRead(contentScope, eventRead);
  const jobs = useSectionRead(contentScope, jobsRead);
  const conversations = useSectionRead(contentScope, conversationsRead);
  const reloadEvent = event.reload,
    reloadJobs = jobs.reload,
    reloadConversations = conversations.reload;
  const reload = useCallback(() => {
    reloadEvent();
    reloadJobs();
    reloadConversations();
  }, [reloadEvent, reloadJobs, reloadConversations]);
  return { event, jobs, conversations, reload };
}
