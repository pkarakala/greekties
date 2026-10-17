import { useState } from 'react';
import { Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ScreenHeader } from '@/components/ScreenHeader';
import { TextField } from '@/components/TextField';
import { Button } from '@/components/Button';
import { spacing } from '@/theme';
import { colors, typography } from '@/theme/account';
import { parseInviteCode } from '@/lib/links';

/**
 * Accepts a raw invite code or a full invite link
 * (greekties://join/<code> or https://…/join/<code>) and extracts the code.
 */
export default function EnterCodeScreen() {
  const router = useRouter();
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  function handleJoin() {
    const code = parseInviteCode(input);
    if (!code) {
      setError('Enter a valid code or the complete Greek Ties invitation link.');
      return;
    }
    setError(null);
    router.push({ pathname: '/join/[code]', params: { code } });
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader tone="home" title="Join a chapter" onBack={() => router.back()} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.hint}>
            Paste the invite code or link your chapter shared with you. If you just installed the
            app, reopen your original invitation or paste it here. Opening another invitation
            replaces your saved invitation.
          </Text>

          <TextField
            tone="home"
            label="Invite code"
            value={input}
            onChangeText={setInput}
            placeholder="Code or invite link"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="go"
            onSubmitEditing={handleJoin}
            errorText={error ?? undefined}
          />

          <Button tone="home" label="Join" onPress={handleJoin} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  scroll: { padding: 20, gap: spacing.md, paddingBottom: spacing.xxxl },
  hint: {
    ...typography.body,
    color: colors.navy,
    backgroundColor: colors.goldLight,
    borderTopWidth: 6,
    borderTopColor: colors.gold,
    padding: 16,
    marginBottom: spacing.md,
  },
});
