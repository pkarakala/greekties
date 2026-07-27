import { useCallback, useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabase';

// Ephemeral typing indicators over Supabase Realtime **broadcast** channels.
// Broadcast never touches Postgres — no table, no migration, no RLS needed —
// and nothing is persisted; an indicator simply expires a few seconds after
// the last signal.
//
// SECURITY NOTE: broadcast channel names (`typing:<channelId>`) are guessable
// by anyone with the anon key, so ONLY the sender's display name is broadcast.
// Never put message content (or anything else sensitive) in the payload.

/** Minimum gap between broadcasts from this device while the user types. */
const THROTTLE_MS = 2000;
/** How long a received typing signal stays visible without a refresh. */
const TYPING_TTL_MS = 5000;
/** How often expired entries are swept out of the typers list. */
const SWEEP_MS = 4000;

interface TypingEntry {
  name: string;
  /** Epoch ms after which this entry no longer counts as "typing". */
  expires: number;
}

export interface TypingIndicator {
  /** Display names of other members currently typing in the channel. */
  typers: string[];
  /** Call on every composer keystroke; throttled internally. */
  signalTyping: () => void;
}

/**
 * Join the `typing:<channelId>` broadcast room: `signalTyping()` announces
 * this user (at most once per {@link THROTTLE_MS}), and `typers` lists the
 * display names of everyone else who signalled within {@link TYPING_TTL_MS}.
 * Inert when `channelId` is null; cleans up the channel + sweep interval on
 * unmount or channel change.
 */
export function useTypingIndicator(
  channelId: string | null,
  userId: string | null,
  displayName: string | null,
): TypingIndicator {
  const [typers, setTypers] = useState<string[]>([]);

  const channelRef = useRef<RealtimeChannel | null>(null);
  // userId → who's typing and until when. A ref (not state) so broadcast
  // handlers and the sweep can mutate it without re-render churn; `typers`
  // state is only updated when the visible name list actually changes.
  const typersRef = useRef<Map<string, TypingEntry>>(new Map());
  const lastSentAtRef = useRef(0);

  // Recompute the visible names, skipping the state update when unchanged so
  // the 4s sweep doesn't re-render an idle screen.
  const refreshTypers = useCallback(() => {
    const now = Date.now();
    for (const [id, entry] of typersRef.current) {
      if (entry.expires <= now) typersRef.current.delete(id);
    }
    const names = [...typersRef.current.values()].map((e) => e.name);
    setTypers((prev) =>
      prev.length === names.length && prev.every((n, i) => n === names[i]) ? prev : names,
    );
  }, []);

  useEffect(() => {
    typersRef.current = new Map();
    lastSentAtRef.current = 0;
    setTypers([]);
    if (!channelId) return;

    const chan = supabase.channel(`typing:${channelId}`, {
      config: { broadcast: { self: false } },
    });
    channelRef.current = chan;

    chan
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        const fromId = typeof payload?.userId === 'string' ? payload.userId : null;
        if (!fromId || fromId === userId) return; // never show "you are typing"
        const name = typeof payload?.name === 'string' && payload.name ? payload.name : 'Someone';
        typersRef.current.set(fromId, { name, expires: Date.now() + TYPING_TTL_MS });
        refreshTypers();
      })
      .subscribe();

    const sweep = setInterval(refreshTypers, SWEEP_MS);

    return () => {
      clearInterval(sweep);
      channelRef.current = null;
      supabase.removeChannel(chan);
    };
  }, [channelId, userId, refreshTypers]);

  const signalTyping = useCallback(() => {
    const chan = channelRef.current;
    if (!chan || !channelId || !userId) return;
    const now = Date.now();
    if (now - lastSentAtRef.current < THROTTLE_MS) return;
    lastSentAtRef.current = now;
    try {
      // Display name only — see the security note at the top of this file.
      void chan
        .send({
          type: 'broadcast',
          event: 'typing',
          payload: { userId, name: displayName ?? 'Someone' },
        })
        .catch(() => {});
    } catch {
      // Realtime unavailable / not yet joined — typing indicators are
      // best-effort, so drop the signal silently.
    }
  }, [channelId, userId, displayName]);

  return { typers, signalTyping };
}
