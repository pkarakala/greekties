import { Stack } from 'expo-router';
import { colors } from '@/theme';

// Nested stack inside the Chats tab: channel list → channel thread.
export default function ChatsLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    />
  );
}
