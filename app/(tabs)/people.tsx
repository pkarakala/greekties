import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ScrollView,
  RefreshControl,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/lib/auth';
import { useChapterMembers } from '@/lib/queries';
import { useJobs } from '@/lib/jobs';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SegmentedControl } from '@/components/SegmentedControl';
import { SearchBar } from '@/components/SearchBar';
import { Chip } from '@/components/Chip';
import { MemberCard } from '@/components/MemberCard';
import { JobCard } from '@/components/JobCard';
import { colors, spacing, typography } from '@/theme';
import type { JobPosting, Profile } from '@/lib/types';

type Tab = 'directory' | 'jobs';

const TABS = [
  { value: 'directory' as const, label: 'Directory' },
  { value: 'jobs' as const, label: 'Jobs' },
];

export default function PeopleScreen() {
  const { profile } = useAuth();
  // Home quick actions deep-link here: ?view=jobs opens the Jobs segment,
  // ?filter=mentors preselects the Mentors chip in the directory.
  const { view, filter } = useLocalSearchParams<{ view?: string; filter?: string }>();
  const [tab, setTab] = useState<Tab>(view === 'jobs' ? 'jobs' : 'directory');
  const chapterId = profile?.chapter_id ?? null;

  useEffect(() => {
    if (view === 'jobs') setTab('jobs');
    else if (view === 'directory') setTab('directory');
  }, [view]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title="People" />
      <View style={styles.toggleWrap}>
        <SegmentedControl options={TABS} value={tab} onChange={setTab} />
      </View>
      {tab === 'directory' ? (
        <DirectoryView chapterId={chapterId} initialMentorsOnly={filter === 'mentors'} />
      ) : (
        <JobsView chapterId={chapterId} />
      )}
    </SafeAreaView>
  );
}

function DirectoryView({
  chapterId,
  initialMentorsOnly = false,
}: {
  chapterId: string | null;
  initialMentorsOnly?: boolean;
}) {
  const router = useRouter();
  const { loading, error, members, reload, loadMore, hasMore, loadingMore } =
    useChapterMembers(chapterId);

  const [query, setQuery] = useState('');
  const [mentorsOnly, setMentorsOnly] = useState(initialMentorsOnly);
  const [hiringOnly, setHiringOnly] = useState(false);
  const [industry, setIndustry] = useState<string | null>(null);

  const industries = useMemo(() => {
    const set = new Set<string>();
    for (const m of members) if (m.industry) set.add(m.industry);
    return [...set].sort();
  }, [members]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return members.filter((m) => {
      if (mentorsOnly && !m.open_to_mentor) return false;
      if (hiringOnly && !m.is_hiring) return false;
      if (industry && m.industry !== industry) return false;
      if (q) {
        const haystack = [m.name, m.company, m.job_title, m.city, m.role]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [members, query, mentorsOnly, hiringOnly, industry]);

  return (
    <FlatList
      data={filtered}
      keyExtractor={(item) => item.id}
      renderItem={({ item }: { item: Profile }) => (
        <MemberCard
          profile={item}
          onPress={() => router.push({ pathname: '/profile/[id]', params: { id: item.id } })}
        />
      )}
      contentContainerStyle={styles.list}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      onEndReached={() => {
        if (hasMore && !loadingMore) void loadMore();
      }}
      onEndReachedThreshold={0.4}
      ListFooterComponent={
        loadingMore ? (
          <View style={styles.footerLoading}>
            <ActivityIndicator color={colors.gold} />
          </View>
        ) : null
      }
      refreshControl={
        <RefreshControl refreshing={loading} onRefresh={reload} tintColor={colors.gold} />
      }
      ListHeaderComponent={
        <View style={styles.controls}>
          <SearchBar
            value={query}
            onChangeText={setQuery}
            placeholder="Search by name, company, city"
          />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chips}
          >
            <Chip label="Mentors" selected={mentorsOnly} onPress={() => setMentorsOnly((v) => !v)} />
            <Chip label="Hiring" selected={hiringOnly} onPress={() => setHiringOnly((v) => !v)} />
            {industries.map((ind) => (
              <Chip
                key={ind}
                label={ind}
                selected={industry === ind}
                onPress={() => setIndustry((cur) => (cur === ind ? null : ind))}
              />
            ))}
          </ScrollView>
          {!loading && (
            <Text style={styles.count}>
              {filtered.length} {filtered.length === 1 ? 'member' : 'members'}
            </Text>
          )}
        </View>
      }
      ListEmptyComponent={
        loading ? null : (
          <View style={styles.empty}>
            <Ionicons name="search-outline" size={40} color={colors.textTertiary} />
            <Text style={styles.emptyText}>
              {error ? `Couldn’t load members: ${error}` : 'No members match your filters.'}
            </Text>
          </View>
        )
      }
    />
  );
}

function JobsView({ chapterId }: { chapterId: string | null }) {
  const router = useRouter();
  const { loading, error, jobs, reload, loadMore, hasMore, loadingMore } = useJobs(chapterId);

  const [query, setQuery] = useState('');
  const [industry, setIndustry] = useState<string | null>(null);
  const [city, setCity] = useState<string | null>(null);

  // Refresh when returning from the post-a-job form.
  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  const industries = useMemo(() => {
    const set = new Set<string>();
    for (const j of jobs) if (j.industry) set.add(j.industry);
    return [...set].sort();
  }, [jobs]);

  const cities = useMemo(() => {
    const set = new Set<string>();
    for (const j of jobs) if (j.location) set.add(j.location);
    return [...set].sort();
  }, [jobs]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return jobs.filter((j) => {
      if (industry && j.industry !== industry) return false;
      if (city && j.location !== city) return false;
      if (q) {
        const haystack = [j.title, j.company, j.location, j.industry]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [jobs, query, industry, city]);

  return (
    <FlatList
      data={filtered}
      keyExtractor={(item) => item.id}
      renderItem={({ item }: { item: JobPosting }) => (
        <JobCard
          job={item}
          onPress={() => router.push({ pathname: '/jobs/[id]', params: { id: item.id } })}
        />
      )}
      contentContainerStyle={styles.list}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      onEndReached={() => {
        if (hasMore && !loadingMore) void loadMore();
      }}
      onEndReachedThreshold={0.4}
      ListFooterComponent={
        loadingMore ? (
          <View style={styles.footerLoading}>
            <ActivityIndicator color={colors.gold} />
          </View>
        ) : null
      }
      refreshControl={
        <RefreshControl refreshing={loading} onRefresh={reload} tintColor={colors.gold} />
      }
      ListHeaderComponent={
        <View style={styles.controls}>
          <Pressable
            style={({ pressed }) => [styles.postBtn, pressed && styles.postPressed]}
            onPress={() => router.push('/jobs/new')}
          >
            <Ionicons name="add" size={20} color={colors.gold} />
            <Text style={styles.postLabel}>Post a job</Text>
          </Pressable>

          <SearchBar
            value={query}
            onChangeText={setQuery}
            placeholder="Search jobs by title, company"
          />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chips}
          >
            {industries.map((ind) => (
              <Chip
                key={`ind-${ind}`}
                label={ind}
                selected={industry === ind}
                onPress={() => setIndustry((cur) => (cur === ind ? null : ind))}
              />
            ))}
            {cities.map((c) => (
              <Chip
                key={`city-${c}`}
                label={c}
                selected={city === c}
                onPress={() => setCity((cur) => (cur === c ? null : c))}
              />
            ))}
          </ScrollView>
        </View>
      }
      ListEmptyComponent={
        loading ? null : (
          <View style={styles.empty}>
            <Ionicons name="briefcase-outline" size={40} color={colors.textTertiary} />
            <Text style={styles.emptyText}>
              {error
                ? `Couldn’t load jobs: ${error}`
                : 'No openings yet. Be the first to post one.'}
            </Text>
          </View>
        )
      }
    />
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  toggleWrap: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.md },
  controls: { gap: spacing.md, paddingBottom: spacing.md },
  chips: { gap: spacing.sm, paddingRight: spacing.lg },
  count: { ...typography.caption, color: colors.textTertiary },
  footerLoading: { paddingVertical: spacing.md, alignItems: 'center' },
  postBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.gold,
    backgroundColor: colors.goldSoft,
  },
  postPressed: { opacity: 0.8 },
  postLabel: { ...typography.h3, color: colors.gold },
  empty: { alignItems: 'center', gap: spacing.md, paddingTop: spacing.xxxl },
  emptyText: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: spacing.xl,
  },
});
