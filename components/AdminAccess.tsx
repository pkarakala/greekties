import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { isAdmin } from '@/lib/types';
import { ScreenHeader } from './ScreenHeader';
import { colors, typography } from '@/theme/account';

/** Uses existing approved owner/manager eligibility; server authorization is unchanged. */
export function AdminAccess({ children }: { children: ReactNode }) {
  const { session, profile } = useAuth();
  const router = useRouter();
  if (!isAdmin(profile))
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
        <ScreenHeader tone="home" title="Chapter management" onBack={() => router.back()} />
        <Text style={{ ...typography.body, color: colors.navy, padding: 20 }}>
          Chapter admin access required.
        </Text>
      </SafeAreaView>
    );
  return (
    <View
      key={JSON.stringify([session?.user.id, profile?.chapter_id, profile?.admin_role])}
      style={{ flex: 1 }}
    >
      {children}
    </View>
  );
}
