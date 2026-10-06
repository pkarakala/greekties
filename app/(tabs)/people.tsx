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
import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';
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
  const { profile, blockedIds } = useAuth();
  const router = useRouter();
  const [mentorShortcut, setMentorShortcut] = useState(0);
  // Home quick actions deep-link here: ?view=jobs opens the Jobs segment,
  // ?filter=mentors preselects the Mentors chip in the directory.
  const { view, filter } = useLocalSearchParams<{ view?: string; filter?: string }>();
  const [tab, setTab] = useState<Tab>(view === 'jobs' ? 'jobs' : 'directory');
  const chapterId = profile?.chapter_id ?? null;

  useEffect(() => {
    if (view === 'jobs') setTab('jobs');
    else if (view === 'directory' || filter === 'mentors') setTab('directory');
    if (filter === 'mentors' && view !== 'jobs') setMentorShortcut((value) => value + 1);
    if (view || filter) router.setParams({ view: undefined, filter: undefined });
  }, [view, filter, router]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title="People" />
      <View style={styles.toggleWrap}>
        <SegmentedControl options={TABS} value={tab} onChange={setTab} />
      </View>
      {tab === 'directory' ? (
        <DirectoryView
          chapterId={chapterId}
          blockedIds={blockedIds}
          mentorShortcut={mentorShortcut}
        />
      ) : (
        <JobsView chapterId={chapterId} blockedIds={blockedIds} />
      )}
    </SafeAreaView>
  );
}

function DirectoryView({
  chapterId,
  blockedIds,
  mentorShortcut = 0,
}: {
  chapterId: string | null;
  blockedIds: ReadonlySet<string>;
  mentorShortcut?: number;
}) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [mentorsOnly, setMentorsOnly] = useState(mentorShortcut > 0);
  const [hiringOnly, setHiringOnly] = useState(false);
  const [industry, setIndustry] = useState<string | null>(null);

  useEffect(() => {
    if (mentorShortcut > 0) {
      setMentorsOnly(true);
      setQuery('');
      setHiringOnly(false);
      setIndustry(null);
    }
  }, [mentorShortcut]);

  const [debouncedQuery, setDebouncedQuery] = useState(query);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 250);
    return () => clearTimeout(timer);
  }, [query]);
  const searching = query !== debouncedQuery;
  const { loading, error, members, reload, loadMore, hasMore, loadingMore } = useChapterMembers(
    chapterId,
    blockedIds,
    { query: debouncedQuery, mentorsOnly, hiringOnly, industry },
  );
  const filtered = searching
    ? []
    : members.filter(
        (m) =>
          (!mentorsOnly || m.open_to_mentor) &&
          (!hiringOnly || m.is_hiring) &&
          (!industry || m.industry === industry.trim()),
      );
  const filteredQuery = !!query.trim() || mentorsOnly || hiringOnly || !!industry;

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
        if (!searching && hasMore && !loadingMore) void loadMore();
      }}
      onEndReachedThreshold={0.4}
      ListFooterComponent={
        loadingMore ? (
          <View style={styles.footerLoading}>
            <ActivityIndicator color={colors.gold} />
          </View>
        ) : hasMore && !searching ? (
          <Button label="Load more members" variant="secondary" onPress={loadMore} />
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
            <Chip
              label="Mentors"
              selected={mentorsOnly}
              onPress={() => setMentorsOnly((v) => !v)}
            />
            <Chip label="Hiring" selected={hiringOnly} onPress={() => setHiringOnly((v) => !v)} />
          </ScrollView>
          <TextField
            label="Industry (exact name, optional)"
            value={industry ?? ''}
            onChangeText={(value) => setIndustry(value || null)}
            placeholder="e.g. Technology"
          />
          {!!error && (
            <View>
              <Text accessibilityRole="alert" style={styles.emptyText}>
                {error}
              </Text>
              <Button label="Retry search" onPress={reload} />
            </View>
          )}
          {!loading && !searching && !error && (
            <Text style={styles.count}>
              {filtered.length} {filtered.length === 1 ? 'member' : 'members'} loaded
              {hasMore ? ' · More available' : ''}
            </Text>
          )}
        </View>
      }
      ListEmptyComponent={
        loading || searching ? (
          <ActivityIndicator color={colors.gold} />
        ) : error ? null : (
          <View style={styles.empty}>
            <Ionicons name="search-outline" size={40} color={colors.textTertiary} />
            <Text style={styles.emptyText}>
              {filteredQuery
                ? 'No members match your filters.'
                : 'No approved members are visible yet.'}
            </Text>
          </View>
        )
      }
    />
  );
}

function JobsView({
  chapterId,
  blockedIds,
}: {
  chapterId: string | null;
  blockedIds: ReadonlySet<string>;
}) {
  const router = useRouter();
  const { loading, error, jobs, reload, loadMore, hasMore, loadingMore } = useJobs(
    chapterId,
    blockedIds,
  );

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
