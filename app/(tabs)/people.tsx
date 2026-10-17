import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/lib/auth';
import { useChapterMembers } from '@/lib/queries';
import { memberScope, useMembershipCounts } from '@/lib/home';
import { directoryMembership } from '@/lib/directory';
import { useJobs } from '@/lib/jobs';
import { SegmentedControl } from '@/components/SegmentedControl';
import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { SearchBar } from '@/components/SearchBar';
import { Chip } from '@/components/Chip';
import { MemberCard } from '@/components/MemberCard';
import { JobCard } from '@/components/JobCard';
import { spacing } from '@/theme';
import { colors, typography } from '@/theme/network';
import type { JobPosting, MembershipType, Profile } from '@/lib/types';

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
  const { view, filter, membership } = useLocalSearchParams<{
    view?: string;
    filter?: string;
    membership?: string;
  }>();
  const [tab, setTab] = useState<Tab>(view === 'jobs' ? 'jobs' : 'directory');
  const [membershipType, setMembershipType] = useState(directoryMembership(membership));
  const chapterId = profile?.chapter_id ?? null;

  useEffect(() => {
    if (view === 'jobs') setTab('jobs');
    else if (view === 'directory' || filter === 'mentors' || membership) setTab('directory');
    if (membership !== undefined) setMembershipType(directoryMembership(membership));
    if (filter === 'mentors' && view !== 'jobs') setMentorShortcut((value) => value + 1);
    if (view || filter || membership)
      router.setParams({ view: undefined, filter: undefined, membership: undefined });
  }, [view, filter, membership, router]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text accessibilityRole="header" style={styles.title}>
          Network
        </Text>
      </View>
      <View style={styles.toggleWrap}>
        <SegmentedControl tone="home" options={TABS} value={tab} onChange={setTab} />
      </View>
      {tab === 'directory' ? (
        <DirectoryView
          chapterId={chapterId}
          blockedIds={blockedIds}
          mentorShortcut={mentorShortcut}
          membershipType={membershipType}
          onMembershipChange={setMembershipType}
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
  membershipType,
  onMembershipChange,
}: {
  chapterId: string | null;
  blockedIds: ReadonlySet<string>;
  mentorShortcut?: number;
  membershipType: MembershipType | null;
  onMembershipChange: (value: MembershipType | null) => void;
}) {
  const router = useRouter();
  const { session, profile } = useAuth();
  const counts = useMembershipCounts(
    memberScope(profile, session?.user.id ?? null),
    chapterId,
    blockedIds,
  );
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
    { query: debouncedQuery, mentorsOnly, hiringOnly, industry, membershipType },
  );
  const filtered = searching
    ? []
    : members.filter(
        (m) =>
          (!mentorsOnly || m.open_to_mentor) &&
          (!hiringOnly || m.is_hiring) &&
          (!industry || m.industry === industry.trim()) &&
          (!membershipType || m.membership_type === membershipType),
      );
  const filteredQuery =
    !!query.trim() || mentorsOnly || hiringOnly || !!industry || !!membershipType;

  return (
    <FlatList
      data={filtered}
      keyExtractor={(item) => item.id}
      renderItem={({ item }: { item: Profile }) => (
        <MemberCard
          tone="home"
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
          <Button tone="home" label="Load more members" variant="secondary" onPress={loadMore} />
        ) : null
      }
      refreshControl={
        <RefreshControl refreshing={loading} onRefresh={reload} tintColor={colors.gold} />
      }
      ListHeaderComponent={
        <View style={styles.controls}>
          <View style={styles.membershipBand}>
            <Text style={styles.bandTitle}>Your chapter, across every stage of life.</Text>
            {counts.data && !counts.error ? (
              <Text style={styles.bandText}>
                {counts.data.active + counts.data.alumni} approved members · {counts.data.active}{' '}
                active · {counts.data.alumni} alumni
              </Text>
            ) : (
              <Text style={styles.bandText}>
                {counts.error ? 'Membership totals unavailable.' : 'Loading membership totals…'}
              </Text>
            )}
            {counts.error && (
              <Button
                tone="home"
                label="Retry totals"
                variant="secondary"
                onPress={counts.reload}
                loading={counts.loading}
              />
            )}
          </View>
          <SearchBar
            tone="home"
            value={query}
            onChangeText={setQuery}
            placeholder="Search by name, company, city"
          />
          <View style={styles.membershipFilters}>
            <Chip
              tone="home"
              label="All"
              selected={!membershipType}
              onPress={() => onMembershipChange(null)}
            />
            <Chip
              tone="home"
              label="Current members"
              selected={membershipType === 'active'}
              onPress={() => onMembershipChange('active')}
            />
            <Chip
              tone="home"
              label="Alumni"
              selected={membershipType === 'alumni'}
              onPress={() => onMembershipChange('alumni')}
            />
          </View>
          <View style={styles.membershipFilters}>
            <Chip
              tone="home"
              label="Mentors"
              selected={mentorsOnly}
              onPress={() => setMentorsOnly((v) => !v)}
            />
            <Chip
              tone="home"
              label="Hiring"
              selected={hiringOnly}
              onPress={() => setHiringOnly((v) => !v)}
            />
          </View>
          <TextField
            tone="home"
            label="Industry (exact match, optional)"
            accessibilityLabel="Industry (exact match, optional)"
            autoCorrect={false}
            value={industry ?? ''}
            onChangeText={(value) => setIndustry(value || null)}
            placeholder="e.g. Technology"
          />
          {filteredQuery && (
            <Button
              tone="home"
              label="Clear filters"
              variant="ghost"
              onPress={() => {
                setQuery('');
                setMentorsOnly(false);
                setHiringOnly(false);
                setIndustry(null);
                onMembershipChange(null);
              }}
            />
          )}
          {!!error && (
            <View>
              <Text accessibilityRole="alert" style={styles.emptyText}>
                {error}
              </Text>
              <Button
                tone="home"
                label="Retry search"
                variant="secondary"
                loading={loading}
                onPress={reload}
              />
            </View>
          )}
          {!loading && !searching && !error && (
            <Text accessibilityLiveRegion="polite" style={styles.count}>
              {filtered.length} {filtered.length === 1 ? 'member' : 'members'} loaded
              {hasMore ? ' · More available' : ''}
            </Text>
          )}
        </View>
      }
      ListEmptyComponent={
        loading || searching ? (
          <View style={styles.empty}>
            <ActivityIndicator color={colors.gold} />
            <Text accessibilityLiveRegion="polite" style={styles.count}>
              {searching ? 'Searching members…' : 'Loading members…'}
            </Text>
          </View>
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
          tone="home"
          job={item}
          onPress={() => router.push({ pathname: '/jobs/[id]', params: { id: item.id } })}
        />
      )}
      contentContainerStyle={styles.list}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      onEndReached={() => {
        if (!loading && hasMore && !loadingMore) void loadMore();
      }}
      onEndReachedThreshold={0.4}
      ListFooterComponent={
        loadingMore ? (
          <View style={styles.footerLoading}>
            <ActivityIndicator color={colors.gold} />
          </View>
        ) : hasMore ? (
          <Button
            tone="home"
            label="Load more jobs"
            variant="secondary"
            disabled={loading}
            onPress={loadMore}
          />
        ) : null
      }
      refreshControl={
        <RefreshControl refreshing={loading} onRefresh={reload} tintColor={colors.gold} />
      }
      ListHeaderComponent={
        <View style={styles.controls}>
          <Text style={styles.intro}>Opportunities shared with your chapter.</Text>
          <Button tone="home" label="Post a job" onPress={() => router.push('/jobs/new')} />

          <SearchBar
            tone="home"
            value={query}
            onChangeText={setQuery}
            placeholder="Search jobs by title, company"
          />
          {industries.length > 0 && (
            <View style={styles.filterGroup}>
              <Text style={styles.filterLabel}>Industry</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chips}
              >
                {industries.map((ind) => (
                  <Chip
                    tone="home"
                    key={`ind-${ind}`}
                    label={ind}
                    selected={industry === ind}
                    onPress={() => setIndustry((cur) => (cur === ind ? null : ind))}
                  />
                ))}
              </ScrollView>
            </View>
          )}
          {cities.length > 0 && (
            <View style={styles.filterGroup}>
              <Text style={styles.filterLabel}>Location</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chips}
              >
                {cities.map((c) => (
                  <Chip
                    tone="home"
                    key={`city-${c}`}
                    label={c}
                    selected={city === c}
                    onPress={() => setCity((cur) => (cur === c ? null : c))}
                  />
                ))}
              </ScrollView>
            </View>
          )}
          {(query.trim() || industry || city) && (
            <Button
              tone="home"
              label="Clear job filters"
              variant="ghost"
              onPress={() => {
                setQuery('');
                setIndustry(null);
                setCity(null);
              }}
            />
          )}
          {!!error && (
            <View style={styles.notice}>
              <Text accessibilityRole="alert" style={styles.error}>
                Couldn’t load jobs.{' '}
                {jobs.length > 0 ? 'Showing the last loaded opportunities.' : 'Please try again.'}
              </Text>
              <Button
                tone="home"
                label="Retry jobs"
                variant="secondary"
                loading={loading}
                onPress={reload}
              />
            </View>
          )}
          {loading && (
            <Text accessibilityLiveRegion="polite" style={styles.count}>
              {jobs.length > 0 ? 'Updating jobs…' : 'Loading jobs…'}
            </Text>
          )}
          {!loading && !error && (
            <Text accessibilityLiveRegion="polite" style={styles.count}>
              {filtered.length} {filtered.length === 1 ? 'job' : 'jobs'} shown
              {hasMore ? ' · More available' : ''}
            </Text>
          )}
          {hasMore && (
            <Text style={styles.count}>
              Search and filters cover loaded jobs. Load more for older openings.
            </Text>
          )}
        </View>
      }
      ListEmptyComponent={
        loading ? (
          <View style={styles.empty}>
            <ActivityIndicator color={colors.gold} />
          </View>
        ) : error ? null : (
          <View style={styles.empty}>
            <Ionicons name="briefcase-outline" size={40} color={colors.textTertiary} />
            <Text style={styles.emptyText}>
              {query.trim() || industry || city
                ? 'No loaded jobs match your search or filters.'
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
  header: { padding: 20, borderBottomWidth: 6, borderBottomColor: colors.gold, marginBottom: 16 },
  title: { ...typography.h1, color: colors.blue },
  toggleWrap: { paddingHorizontal: 20, paddingBottom: spacing.md },
  list: { paddingHorizontal: 20, paddingBottom: spacing.xxxl, gap: spacing.md },
  controls: { gap: spacing.md, paddingBottom: spacing.md },
  chips: { gap: spacing.sm, paddingRight: spacing.lg },
  membershipFilters: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  membershipBand: { backgroundColor: colors.gold, padding: 16, gap: 8, borderRadius: 8 },
  bandTitle: { ...typography.body, color: colors.navy, fontWeight: '600' },
  bandText: { ...typography.bodySmall, color: colors.navy },
  count: { fontSize: 13, lineHeight: 18, color: colors.textSecondary },
  footerLoading: { paddingVertical: spacing.md, alignItems: 'center' },
  intro: { fontSize: 15, lineHeight: 21, color: colors.textSecondary },
  filterGroup: { gap: spacing.sm },
  filterLabel: { fontSize: 13, lineHeight: 18, fontWeight: '600', color: colors.textSecondary },
  notice: {
    gap: spacing.sm,
    borderLeftWidth: 3,
    borderLeftColor: colors.red,
    paddingLeft: spacing.md,
  },
  error: { fontSize: 15, lineHeight: 21, color: colors.red },
  empty: { alignItems: 'center', gap: spacing.md, paddingTop: spacing.xxxl },
  emptyText: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
});
