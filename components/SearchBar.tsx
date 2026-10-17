import { useState } from 'react';
import { View, TextInput, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { homeColors } from '@/theme/home';
import { colors, radius, spacing, typography } from '@/theme';

interface SearchBarProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  tone?: 'default' | 'events' | 'home';
}

export function SearchBar({
  value,
  onChangeText,
  placeholder = 'Search',
  tone = 'default',
}: SearchBarProps) {
  const [focused, setFocused] = useState(false);
  return (
    <View
      style={[
        styles.wrap,
        tone === 'events' && styles.polished,
        tone === 'home' && styles.home,
        tone === 'home' && focused && { borderColor: homeColors.blue },
        tone === 'events' && focused && { borderColor: colors.gold },
      ]}
    >
      <Ionicons
        name="search"
        size={18}
        color={tone === 'home' ? homeColors.muted : colors.textTertiary}
      />
      <TextInput
        accessibilityRole="search"
        accessibilityLabel={placeholder}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[styles.input, tone === 'home' && styles.homeInput]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={tone === 'home' ? homeColors.muted : colors.textTertiary}
        selectionColor={tone === 'home' ? homeColors.blue : colors.gold}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        clearButtonMode="while-editing"
      />
      {value.length > 0 && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Clear search"
          onPress={() => onChangeText('')}
          hitSlop={8}
          style={[tone !== 'default' && styles.clear, tone === 'home' && styles.homeClear]}
        >
          <Ionicons
            name="close-circle"
            size={18}
            color={tone === 'home' ? homeColors.muted : colors.textTertiary}
          />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    height: 44,
  },
  polished: { height: 'auto', minHeight: 48, borderRadius: 8, borderColor: colors.borderStrong },
  home: {
    height: 'auto',
    minHeight: 48,
    borderRadius: 6,
    borderColor: '#7F8CA1',
    backgroundColor: homeColors.surface,
  },
  homeInput: { minHeight: 48, fontSize: 15, lineHeight: 23, color: homeColors.navy },
  homeClear: { minWidth: 48, minHeight: 48 },
  clear: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  input: { flex: 1, ...typography.body, color: colors.textPrimary, padding: 0 },
});
