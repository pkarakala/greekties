import { useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/lib/auth';
import { useNetworkBreakdown, type BreakdownEntry } from '@/lib/queries';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { AnimatedNumber } from '@/components/AnimatedNumber';
import { colors, radius, spacing, typography } from '@/theme';

// The "Network Net Worth" breakdown — the number on Home, opened up.
// Portfolio-style: hero total, stat tiles, then proportional bars showing
// where the chapter's network clusters.

export default function NetworkScreen() {
  const router = useRouter();
  const { profile } = useAuth();
  const { loading, error, breakdown, reload } = useNetworkBreakdown(profile?.chapter_id ?? null);

  // Deep-link home (where the InviteCard lives) rather than router.back():
  // this screen can also be reached directly via the /network URL.
  const goHome = useCallback(() => router.replace('/'), [router]);

  // Error wins over the empty state — a failed fetch also reports total 0,
  // and we shouldn't celebrate "your network starts here" over an outage.
  const showEmpty = !loading && !error && breakdown.total <= 1;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title="Your Network" onBack={() => router.back()} />

      <ScrollView
        contentContainerStyle={[styles.scroll, showEmpty && styles.scrollEmpty]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={reload} tintColor={colors.gold} />
        }
      >
        {showEmpty ? (
          <View style={styles.empty}>
            <Ionicons name="trending-up" size={48} color={colors.gold} />
            <Text style={styles.emptyTitle}>Your network starts here</Text>
            <Text style={styles.emptyBody}>
              Every brother or sister who joins adds their industry, company, and city to your
              chapter’s reach. Invite your chapter and watch this number grow.
            </Text>
            <View style={styles.emptyAction}>
              <Button label="Invite your chapter" onPress={goHome} />
            </View>
          </View>
        ) : (
          <>
            {/* Hero — the headline number */}
            <View style={styles.hero}>
              <Text style={styles.heroLabel}>Network net worth</Text>
              <AnimatedNumber value={breakdown.total} style={styles.heroNumber} />
              <Text style={styles.heroSub}>
                {breakdown.total === 1 ? 'person' : 'people'} you can reach through your chapter
              </Text>
            </View>

            {!!error && <Text style={styles.error}>{error}</Text>}

            {/* Stat tiles */}
            <View style={styles.tileRow}>
              <StatTile icon="sparkles" value={breakdown.mentors} label="Mentors" />
              <StatTile icon="briefcase" value={breakdown.hiring} label="Hiring" />
              <StatTile icon="map" value={breakdown.onMap} label="On the map" />
            </View>

            <BreakdownSection title="Industries" entries={breakdown.industries} />
            <BreakdownSection title="Companies" entries={breakdown.companies} />
            <BreakdownSection title="Cities" entries={breakdown.cities} />
            <BreakdownSection
              title="Class years"
              entries={breakdown.classYears.map((y) => ({
                name: `Class of ${y.year}`,
                count: y.count,
              }))}
            />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function StatTile({
  icon,
  value,
  label,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  value: number;
  label: string;
}) {
  return (
    <Card style={styles.tile}>
      <View style={styles.tileIcon}>
        <Ionicons name={icon} size={16} color={colors.gold} />
      </View>
      <Text style={styles.tileValue}>{value}</Text>
      <Text style={styles.tileLabel}>{label}</Text>
    </Card>
  );
}

/** A card of ranked rows, each with a thin proportional bar under the label. */
function BreakdownSection({ title, entries }: { title: string; entries: BreakdownEntry[] }) {
  if (entries.length === 0) return null;
  const max = entries[0]?.count ?? 1;

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Card style={styles.sectionCard}>
        {entries.map((entry) => (
          <View key={entry.name} style={styles.row}>
            <View style={styles.rowHeader}>
              <Text style={styles.rowName} numberOfLines={1}>
                {entry.name}
              </Text>
              <Text style={styles.rowCount}>{entry.count}</Text>
            </View>
            <View style={styles.barTrack}>
              <View
                style={[
                  styles.barFill,
                  { width: `${Math.max(4, Math.round((entry.count / max) * 100))}%` },
                ]}
              />
            </View>
          </View>
        ))}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxxl,
    gap: spacing.xl,
  },
  scrollEmpty: { flexGrow: 1, justifyContent: 'center' },

  hero: { paddingTop: spacing.md },
  heroLabel: { ...typography.heroLabel, color: colors.textSecondary },
  heroNumber: {
    ...typography.hero,
    color: colors.textPrimary,
    padding: 0,
    marginVertical: spacing.xs,
  },
  heroSub: { ...typography.bodySmall, color: colors.textSecondary },

  error: { ...typography.bodySmall, color: colors.red },

  tileRow: { flexDirection: 'row', gap: spacing.md },
  tile: {
    flex: 1,
    alignItems: 'flex-start',
    padding: spacing.md,
    gap: spacing.xs,
  },
  tileIcon: {
    width: 28,
    height: 28,
    borderRadius: radius.full,
    backgroundColor: colors.goldSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  tileValue: { ...typography.h2, color: colors.textPrimary },
  tileLabel: { ...typography.caption, color: colors.textSecondary },

  section: { gap: spacing.md },
  sectionTitle: { ...typography.h3, color: colors.textPrimary },
  sectionCard: { gap: spacing.lg },

  row: { gap: spacing.sm },
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  rowName: { ...typography.bodySmall, color: colors.textPrimary, flex: 1 },
  rowCount: { ...typography.bodySmall, color: colors.textSecondary, fontWeight: '600' },
  barTrack: {
    height: 6,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceHover,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: radius.full,
    backgroundColor: colors.gold,
  },

  empty: {
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  emptyTitle: { ...typography.h2, color: colors.textPrimary, textAlign: 'center' },
  emptyBody: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },
  emptyAction: { alignSelf: 'stretch', marginTop: spacing.lg },
});
