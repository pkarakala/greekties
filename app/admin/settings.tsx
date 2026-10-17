import { AdminAccess } from '@/components/AdminAccess';
import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Share,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/lib/auth';
import { useChapter, updateChapter } from '@/lib/admin';
import { fetchChapterInvite } from '@/lib/chapters';
import { joinLink, joinMessage } from '@/lib/links';
import { ScreenHeader } from '@/components/ScreenHeader';
import { TextField } from '@/components/TextField';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { radius, spacing } from '@/theme';
import { colors, typography } from '@/theme/account';

export default function ChapterSettingsScreen() {
  return (
    <AdminAccess>
      <ChapterSettingsScreenContent />
    </AdminAccess>
  );
}

function ChapterSettingsScreenContent() {
  const router = useRouter();
  const { profile, refreshProfile } = useAuth();
  const chapterId = profile?.chapter_id ?? null;
  const { loading, chapter, reload } = useChapter(chapterId);

  const [name, setName] = useState('');
  const [designation, setDesignation] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);

  useEffect(() => {
    if (chapter) {
      setName(chapter.name ?? '');
      setDesignation(chapter.designation ?? '');
    }
  }, [chapter]);

  useEffect(() => {
    if (!chapterId) return;
    let mounted = true;
    fetchChapterInvite(chapterId).then(({ code, error }) => {
      if (!mounted) return;
      setInviteCode(code);
      setInviteError(
        error ??
          (code ? null : 'Invite links are unavailable until secure invite setup is applied.'),
      );
    });
    return () => {
      mounted = false;
    };
  }, [chapterId]);

  const shareCode = inviteCode;
  const inviteLink = shareCode ? joinLink(shareCode) : '';

  async function save() {
    if (!chapterId) return;
    setError(null);
    setSaved(false);
    setSaving(true);
    const err = await updateChapter(chapterId, {
      name: name.trim(),
      designation: designation.trim(),
    });
    setSaving(false);
    if (err) {
      setError(err);
      return;
    }
    setSaved(true);
    await refreshProfile();
  }

  async function shareInvite() {
    if (!shareCode) {
      setInviteError('Invite links are unavailable until secure invite setup is applied.');
      return;
    }
    try {
      await Share.share({
        message: joinMessage(shareCode, chapter?.name ?? null),
      });
    } catch {
      Alert.alert('Couldn’t open share sheet');
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader tone="home" title="Chapter settings" onBack={() => router.back()} />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.blue} />
        </View>
      ) : !chapter ? (
        <View style={styles.center}>
          <Text style={styles.inviteHint}>
            Chapter settings are unavailable. Retry to check again.
          </Text>
          <Button tone="home" label="Retry chapter settings" onPress={reload} />
        </View>
      ) : (
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <TextField
              tone="home"
              label="Chapter name"
              value={name}
              onChangeText={setName}
              placeholder="Beta Theta Pi"
            />
            <TextField
              tone="home"
              label="Designation"
              value={designation}
              onChangeText={setDesignation}
              placeholder="Alpha Phi"
            />

            {!!error && (
              <Text accessibilityRole="alert" style={styles.error}>
                {error}
              </Text>
            )}
            {saved && <Text style={styles.saved}>Saved.</Text>}

            <Button tone="home" label="Save changes" onPress={save} loading={saving} />

            <Card tone="home" style={styles.inviteCard}>
              <View style={styles.inviteHeader}>
                <Ionicons name="link" size={18} color={colors.blue} />
                <Text style={styles.inviteTitle}>Invite link</Text>
              </View>
              <Text style={styles.inviteHint}>
                Use this link to request chapter membership. Approval remains controlled by your
                chapter.
              </Text>
              {inviteLink ? (
                <>
                  <Text selectable style={styles.inviteLink}>
                    {inviteLink}
                  </Text>
                  <Button
                    tone="home"
                    label="Share invite link"
                    variant="secondary"
                    onPress={shareInvite}
                  />
                </>
              ) : (
                <Text accessibilityRole="alert" style={styles.error}>
                  {inviteError ?? 'Invite link unavailable.'}
                </Text>
              )}
            </Card>
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: 20, gap: spacing.md, paddingBottom: spacing.xxxl },
  error: { ...typography.bodySmall, color: colors.red },
  saved: { ...typography.bodySmall, color: colors.green },
  inviteCard: {
    gap: spacing.sm,
    marginTop: spacing.lg,
    backgroundColor: colors.goldLight,
    borderTopWidth: 6,
    borderTopColor: colors.gold,
  },
  inviteHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  inviteTitle: { ...typography.h3, color: colors.textPrimary },
  inviteHint: { ...typography.bodySmall, color: colors.textSecondary },
  inviteLink: {
    ...typography.bodySmall,
    color: colors.blue,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.md,
    padding: spacing.md,
  },
});
