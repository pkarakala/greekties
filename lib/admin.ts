import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';
import type { Channel, ChannelVisibility, Chapter, MembershipType, Profile } from './types';

// ── Member approvals ─────────────────────────────────────────────────────────

export interface PendingMembersData {
  loading: boolean;
  error: string | null;
  members: Profile[];
  reload: () => void;
}

export function usePendingMembers(chapterId: string | null): PendingMembersData {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [members, setMembers] = useState<Profile[]>([]);
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

    supabase
      .from('profiles')
      .select('*')
      .eq('chapter_id', chapterId)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .then(({ data, error: err }) => {
        if (!mounted) return;
        if (err) setError(err.message);
        else setMembers((data as Profile[]) ?? []);
        setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [chapterId, nonce]);

  return { loading, error, members, reload };
}

export async function approveMember(profileId: string): Promise<string | null> {
  const { error } = await supabase.rpc('approve_chapter_member', {
    target_profile_id: profileId,
  });
  return error?.message ?? null;
}

/** Reject a pending join while retaining its row for audit/appeal. */
export async function rejectMember(profileId: string): Promise<string | null> {
  const { error } = await supabase.rpc('reject_chapter_member', {
    target_profile_id: profileId,
  });
  return error?.message ?? null;
}

// ── Member management (approved members: roles + removal) ───────────────────

// Mirrors lib/queries.ts MEMBER_COLUMNS (kept local so the admin module isn't
// coupled to directory queries). Deliberately excludes `email` — the member
// list never renders it, so PII stays off the wire.
const ADMIN_MEMBER_COLUMNS =
  'id, user_id, chapter_id, name, avatar_url, class_year, role, membership_type, industry, city, company, job_title, open_to_mentor, is_hiring, status, admin_role, linkedin_url, bio, created_at';

export interface ChapterMemberListData {
  loading: boolean;
  error: string | null;
  members: Profile[];
  reload: () => void;
}

/** Approved members in a chapter, ordered by name, for the admin member list. */
export function useChapterMemberList(chapterId: string | null): ChapterMemberListData {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [members, setMembers] = useState<Profile[]>([]);
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

    supabase
      .from('profiles')
      .select(ADMIN_MEMBER_COLUMNS)
      .eq('chapter_id', chapterId)
      .eq('status', 'approved')
      .order('name', { ascending: true })
      .then(({ data, error: err }) => {
        if (!mounted) return;
        if (err) setError(err.message);
        else setMembers((data as Profile[]) ?? []);
        setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [chapterId, nonce]);

  return { loading, error, members, reload };
}

/**
 * Grant or revoke the 'manager' admin role (null = regular member). The
 * server-side RPC permits only an approved owner in the same chapter.
 */
export async function setMemberRole(
  profileId: string,
  role: 'manager' | null,
): Promise<string | null> {
  const { error } = await supabase.rpc('set_chapter_member_admin_role', {
    target_profile_id: profileId,
    target_admin_role: role,
  });
  return error?.message ?? null;
}

/**
 * Set the controlled active/alumni designation. The RPC enforces approval,
 * chapter tenancy, and the owner/manager hierarchy; `profiles.role` remains
 * unrelated professional display text.
 */
export async function setMemberMembershipType(
  profileId: string,
  membershipType: MembershipType,
): Promise<string | null> {
  const { error } = await supabase.rpc('set_chapter_member_membership_type', {
    target_profile_id: profileId,
    target_membership_type: membershipType,
  });
  return error?.message ?? null;
}

/**
 * Remove an approved member from the chapter by moving them to `rejected`.
 * Authorization and admin hierarchy are enforced by the server-side RPC.
 */
export async function removeMember(profileId: string): Promise<string | null> {
  const { error } = await supabase.rpc('reject_chapter_member', {
    target_profile_id: profileId,
  });
  return error?.message ?? null;
}

// ── Channel management ───────────────────────────────────────────────────────

export interface AdminChannelsData {
  loading: boolean;
  error: string | null;
  channels: Channel[];
  reload: () => void;
}

export function useAdminChannels(chapterId: string | null): AdminChannelsData {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
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

    supabase
      .from('channels')
      .select('*')
      .eq('chapter_id', chapterId)
      .order('created_at', { ascending: true })
      .then(({ data, error: err }) => {
        if (!mounted) return;
        if (err) setError(err.message);
        else setChannels((data as Channel[]) ?? []);
        setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [chapterId, nonce]);

  return { loading, error, channels, reload };
}

export async function createChannel(input: {
  chapterId: string;
  name: string;
  visibility: ChannelVisibility;
  createdBy: string;
  description?: string;
}): Promise<string | null> {
  const { error } = await supabase.from('channels').insert({
    chapter_id: input.chapterId,
    name: input.name,
    visibility: input.visibility,
    created_by: input.createdBy,
    description: input.description || null,
  });
  return error?.message ?? null;
}

export async function updateChannelName(id: string, name: string): Promise<string | null> {
  const { error } = await supabase.from('channels').update({ name }).eq('id', id);
  return error?.message ?? null;
}

export async function updateChannelVisibility(
  id: string,
  visibility: ChannelVisibility,
): Promise<string | null> {
  const { error } = await supabase.from('channels').update({ visibility }).eq('id', id);
  return error?.message ?? null;
}

export async function deleteChannel(id: string): Promise<string | null> {
  const { error } = await supabase.from('channels').delete().eq('id', id);
  return error?.message ?? null;
}

// ── Chapter settings ─────────────────────────────────────────────────────────

export function useChapter(chapterId: string | null): {
  loading: boolean;
  chapter: Chapter | null;
  reload: () => void;
} {
  const [loading, setLoading] = useState(true);
  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [nonce, setNonce] = useState(0);
  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!chapterId) {
      setLoading(false);
      return;
    }
    let mounted = true;
    setLoading(true);
    supabase
      .from('chapters')
      .select('*')
      .eq('id', chapterId)
      .maybeSingle()
      .then(({ data }) => {
        if (!mounted) return;
        setChapter((data as Chapter) ?? null);
        setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [chapterId, nonce]);

  return { loading, chapter, reload };
}

export async function updateChapter(
  id: string,
  fields: { name?: string; designation?: string },
): Promise<string | null> {
  const { error } = await supabase.from('chapters').update(fields).eq('id', id);
  return error?.message ?? null;
}
