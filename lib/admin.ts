import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';
import type { Channel, ChannelVisibility, Chapter, Profile } from './types';

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
  const { error } = await supabase
    .from('profiles')
    .update({ status: 'approved' })
    .eq('id', profileId);
  return error?.message ?? null;
}

/** Reject a pending join by removing the pending profile row. Destructive. */
export async function rejectMember(profileId: string): Promise<string | null> {
  const { error } = await supabase.from('profiles').delete().eq('id', profileId);
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
