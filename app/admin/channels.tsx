import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  TextInput,
  Alert,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/lib/auth';
import {
  useAdminChannels,
  createChannel,
  updateChannelName,
  updateChannelVisibility,
  deleteChannel,
} from '@/lib/admin';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { Chip } from '@/components/Chip';
import { colors, radius, spacing, typography } from '@/theme';
import type { Channel, ChannelVisibility } from '@/lib/types';

const VISIBILITIES: { value: ChannelVisibility; label: string }[] = [
  { value: 'all', label: 'Everyone' },
  { value: 'exec_only', label: 'Exec only' },
  { value: 'alumni_only', label: 'Alumni only' },
  { value: 'custom', label: 'Custom' },
];

const VIS_LABEL: Record<ChannelVisibility, string> = {
  all: 'Everyone',
  exec_only: 'Exec only',
  alumni_only: 'Alumni only',
  custom: 'Custom',
};

// Tapping a channel's visibility badge cycles through the options.
const VIS_CYCLE: ChannelVisibility[] = ['all', 'exec_only', 'alumni_only', 'custom'];

export default function ChannelsAdminScreen() {
  const router = useRouter();
  const { session, profile } = useAuth();
  const { loading, error, channels, reload } = useAdminChannels(profile?.chapter_id ?? null);

  const [name, setName] = useState('');
  const [visibility, setVisibility] = useState<ChannelVisibility>('all');
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  async function create() {
    setFormError(null);
    if (!name.trim()) {
      setFormError('Give the channel a name.');
      return;
    }
    if (!profile?.chapter_id || !session?.user?.id) return;

    setCreating(true);
    const err = await createChannel({
      chapterId: profile.chapter_id,
      name: name.trim().toLowerCase().replace(/\s+/g, '-'),
      visibility,
      createdBy: session.user.id,
    });
    setCreating(false);

    if (err) setFormError(err);
    else {
      setName('');
      setVisibility('all');
      reload();
    }
  }

  async function saveRename(channel: Channel) {
    const next = editName.trim().toLowerCase().replace(/\s+/g, '-');
    setEditingId(null);
    if (!next || next === channel.name) return;
    const err = await updateChannelName(channel.id, next);
    if (err) Alert.alert('Couldn’t rename', err);
    else reload();
  }

  async function cycleVisibility(channel: Channel) {
    const idx = VIS_CYCLE.indexOf(channel.visibility);
    const next = VIS_CYCLE[(idx + 1) % VIS_CYCLE.length];
    const err = await updateChannelVisibility(channel.id, next);
    if (err) Alert.alert('Couldn’t update visibility', err);
    else reload();
  }

  function confirmDelete(channel: Channel) {
    Alert.alert(
      `Delete #${channel.name}?`,
      'This permanently removes the channel and all its messages.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const err = await deleteChannel(channel.id);
            if (err) Alert.alert('Couldn’t delete', err);
            else reload();
          },
        },
      ],
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title="Channels" onBack={() => router.back()} />

      <FlatList
        data={channels}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={reload} tintColor={colors.gold} />
        }
        ListHeaderComponent={
          <Card style={styles.createCard}>
            <Text style={styles.createTitle}>New channel</Text>
            <TextField
              label="Name"
              value={name}
              onChangeText={setName}
              placeholder="recruitment"
              autoCapitalize="none"
            />
            <Text style={styles.fieldLabel}>Visibility</Text>
            <View style={styles.visRow}>
              {VISIBILITIES.map((v) => (
                <Chip
                  key={v.value}
                  label={v.label}
                  selected={visibility === v.value}
                  onPress={() => setVisibility(v.value)}
                />
              ))}
            </View>
            {!!formError && <Text style={styles.error}>{formError}</Text>}
            <Button label="Create channel" onPress={create} loading={creating} />
          </Card>
        }
        renderItem={({ item }) => (
          <Card style={styles.row}>
            <Text style={styles.hash}>#</Text>
            <View style={styles.rowBody}>
              {editingId === item.id ? (
                <TextInput
                  value={editName}
                  onChangeText={setEditName}
                  autoFocus
                  autoCapitalize="none"
                  selectionColor={colors.gold}
                  style={styles.editInput}
                  onSubmitEditing={() => saveRename(item)}
                  onBlur={() => saveRename(item)}
                />
              ) : (
                <Pressable
                  onPress={() => {
                    setEditingId(item.id);
                    setEditName(item.name);
                  }}
                >
                  <Text style={styles.channelName}>{item.name}</Text>
                </Pressable>
              )}
              <Pressable onPress={() => cycleVisibility(item)} style={styles.visBadge}>
                <Text style={styles.visBadgeText}>{VIS_LABEL[item.visibility]}</Text>
                <Ionicons name="swap-horizontal" size={12} color={colors.textTertiary} />
              </Pressable>
            </View>
            <Pressable onPress={() => confirmDelete(item)} hitSlop={8}>
              <Ionicons name="trash-outline" size={20} color={colors.red} />
            </Pressable>
          </Card>
        )}
        ListEmptyComponent={
          loading ? null : (
            <Text style={styles.emptyText}>
              {error ? `Couldn’t load channels: ${error}` : 'No channels yet. Create one above.'}
            </Text>
          )
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.lg, gap: spacing.md },
  createCard: { gap: spacing.sm, marginBottom: spacing.sm },
  createTitle: { ...typography.h3, color: colors.textPrimary, marginBottom: spacing.xs },
  fieldLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  visRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.sm },
  error: { ...typography.bodySmall, color: colors.red },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  hash: { ...typography.h2, color: colors.textTertiary },
  rowBody: { flex: 1, gap: spacing.xs },
  channelName: { ...typography.h3, color: colors.textPrimary },
  editInput: {
    ...typography.h3,
    color: colors.textPrimary,
    borderBottomWidth: 1,
    borderBottomColor: colors.gold,
    paddingVertical: 2,
  },
  visBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    backgroundColor: colors.surfaceHover,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.sm,
  },
  visBadgeText: { ...typography.caption, color: colors.textSecondary },
  emptyText: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingTop: spacing.xl,
  },
});
