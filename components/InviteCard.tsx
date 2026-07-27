import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Share } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useAuth } from '@/lib/auth';
import { fetchChapterInvite } from '@/lib/chapters';
import { joinLink, joinMessage } from '@/lib/links';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { colors, spacing, typography } from '@/theme';

/**
 * Member-facing invite loop: every member can grow the chapter from Home.
 * The invite RPC only lets chapter admins mint codes, so non-admins get a
 * null code — handled silently with a hint instead of an error.
 */
export function InviteCard() {
  const { profile } = useAuth();
  const chapterId = profile?.chapter_id ?? null;

  const [code, setCode] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Without a chapter the card renders nothing, so no fetch needed.
    if (!chapterId) return;
    let mounted = true;
    fetchChapterInvite(chapterId).then(({ code: inviteCode }) => {
      if (!mounted) return;
      setCode(inviteCode);
      setLoaded(true);
    });
    return () => {
      mounted = false;
    };
  }, [chapterId]);

  useEffect(() => {
    return () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    };
  }, []);

  // Web link so invitees without the app land on the web build.
  const inviteLink = code ? joinLink(code) : null;

  async function shareInvite() {
    if (!code) return;
    try {
      await Share.share({
        message: joinMessage(code),
      });
    } catch {
      // Share sheet dismissed/unavailable — nothing to surface.
    }
  }

  async function copyInvite() {
    if (!inviteLink) return;
    try {
      await Clipboard.setStringAsync(inviteLink);
      setCopied(true);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable — nothing to surface.
    }
  }

  if (!chapterId || !loaded) return null;

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <Ionicons name="person-add" size={18} color={colors.gold} />
        <Text style={styles.title}>Grow your network</Text>
      </View>
      <Text style={styles.blurb}>
        Your network is worth more with every member — invite your chapter.
      </Text>

      {inviteLink ? (
        <View style={styles.actions}>
          <Button label="Share invite link" onPress={shareInvite} />
          <Button
            label={copied ? 'Copied!' : 'Copy link'}
            variant="secondary"
            onPress={copyInvite}
          />
        </View>
      ) : (
        <Text style={styles.hint}>Ask a chapter admin to create an invite link.</Text>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { ...typography.h3, color: colors.textPrimary },
  blurb: { ...typography.bodySmall, color: colors.textSecondary },
  actions: { gap: spacing.sm, marginTop: spacing.sm },
  hint: { ...typography.bodySmall, color: colors.textTertiary },
});
