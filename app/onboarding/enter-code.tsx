import { useState } from 'react';
import {
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ScreenHeader } from '@/components/ScreenHeader';
import { TextField } from '@/components/TextField';
import { Button } from '@/components/Button';
import { colors, spacing, typography } from '@/theme';

/**
 * Accepts a raw invite code or a full invite link
 * (greekties://join/<code> or https://…/join/<code>) and extracts the code.
 */
function extractCode(input: string): string {
  const trimmed = input.trim();
  if (!trimmed.includes('/join/')) return trimmed;
  const afterJoin = trimmed.split('/join/').pop() ?? '';
  // Last path segment, stripped of any query string.
  const segment = afterJoin.split('/').filter(Boolean).pop() ?? '';
  return segment.split('?')[0].trim();
}

export default function EnterCodeScreen() {
  const router = useRouter();
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  function handleJoin() {
    const code = extractCode(input);
    if (!code) {
      setError('Enter your invite code or paste the invite link.');
      return;
    }
    setError(null);
    router.push({ pathname: '/join/[code]', params: { code } });
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title="Join a chapter" onBack={() => router.back()} />
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
            Paste the invite code or link your chapter shared with you.
          </Text>

          <TextField
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

          <Button label="Join" onPress={handleJoin} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  scroll: { padding: spacing.xl, gap: spacing.md, paddingBottom: spacing.xxxl },
  hint: { ...typography.body, color: colors.textSecondary, marginBottom: spacing.md },
});
