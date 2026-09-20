import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { useMemberScope } from '@/lib/scoped-read';
import {
  listShareChannels,
  prepareChatShare,
  type ShareResource,
  type ShareChannel,
} from '@/lib/chat-share';
import { Button } from './Button';
import { colors, spacing, typography } from '@/theme';

export function ShareToChat({ resource }: { resource: ShareResource }) {
  const scope = useMemberScope();
  return <SharePicker key={`${scope}:${resource.kind}:${resource.id}`} resource={resource} />;
}
function SharePicker({ resource }: { resource: ShareResource }) {
  const { session, profile } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [channels, setChannels] = useState<ShareChannel[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const control = useRef({ live: true, busy: false, version: 0, offset: 0 });
  useEffect(() => {
    const c = control.current;
    c.live = true;
    return () => {
      c.live = false;
      c.version++;
    };
  }, []);
  useFocusEffect(
    useCallback(() => {
      const c = control.current;
      return () => {
        c.version++;
        c.busy = false;
        setBusy(false);
        setOpen(false);
      };
    }, []),
  );
  async function load(more = false) {
    const c = control.current;
    if (!profile?.chapter_id || profile.status !== 'approved' || c.busy || !c.live) return;
    c.busy = true;
    const version = ++c.version;
    setBusy(true);
    setOpen(true);
    setError(null);
    if (!more) {
      setChannels([]);
      setHasMore(false);
    }
    try {
      const result = await listShareChannels(profile.chapter_id, more ? c.offset : 0);
      if (!c.live || c.version !== version) return;
      c.offset = (more ? c.offset : 0) + 50;
      setChannels((old) =>
        more
          ? [...old, ...result.channels.filter((ch) => !old.some((o) => o.id === ch.id))]
          : result.channels,
      );
      setHasMore(result.hasMore);
    } catch {
      if (c.live && c.version === version)
        setError('Couldn’t load accessible channels. Please retry.');
    } finally {
      if (c.live && c.version === version) {
        c.busy = false;
        setBusy(false);
      }
    }
  }
  async function choose(channelId: string) {
    const c = control.current;
    if (c.busy || !c.live || !session?.user.id || !profile?.chapter_id) return;
    c.busy = true;
    setBusy(true);
    setError(null);
    const version = ++c.version;
    const current = () => c.live && c.version === version;
    try {
      const share = await prepareChatShare(
        resource,
        channelId,
        profile.chapter_id,
        session.user.id,
        current,
      );
      if (!current()) return;
      setOpen(false);
      router.push({
        pathname: '/(tabs)/chats/[channelId]',
        params: { channelId, shareId: share.id },
      });
    } catch {
      if (current())
        setError(
          'Couldn’t prepare this share. The item or channel may be unavailable. Please retry.',
        );
    } finally {
      if (current()) {
        c.busy = false;
        setBusy(false);
      }
    }
  }
  function cancel() {
    control.current.version++;
    control.current.busy = false;
    setBusy(false);
    setOpen(false);
  }
  return (
    <View style={{ gap: spacing.sm }}>
      {!open ? (
        <Button label="Share to chat" variant="secondary" onPress={() => load()} />
      ) : (
        <>
          <Text style={{ ...typography.h3, color: colors.textPrimary }}>Choose a channel</Text>
          <Text style={{ ...typography.bodySmall, color: colors.textSecondary }}>
            Review the text in chat, then press Send.
          </Text>
          {channels.map((c) => (
            <Button
              key={c.id}
              label={`# ${c.name}`}
              variant="secondary"
              disabled={busy}
              onPress={() => choose(c.id)}
            />
          ))}
          {busy && <Text style={{ color: colors.textSecondary }}>Checking access…</Text>}
          {!busy && !error && channels.length === 0 && (
            <Text style={{ color: colors.textSecondary }}>
              No accessible channels on this page.
            </Text>
          )}
          {!!error && (
            <>
              <Text accessibilityRole="alert" style={{ color: colors.red }}>
                {error}
              </Text>
              <Button label="Retry channels" disabled={busy} onPress={() => load()} />
            </>
          )}
          {hasMore && (
            <Button
              label="More channels"
              variant="secondary"
              disabled={busy}
              onPress={() => load(true)}
            />
          )}
          <Button label="Cancel sharing" variant="ghost" onPress={cancel} />
        </>
      )}
    </View>
  );
}
