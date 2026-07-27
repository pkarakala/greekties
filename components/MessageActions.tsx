import { Alert } from 'react-native';

/**
 * Action sheet shown when long-pressing another member's message bubble.
 * Alert-only (no native action-sheet dependency) so it works everywhere,
 * mirroring the moderation menu pattern in app/profile/[id].tsx.
 */
export function showMessageActions(opts: {
  senderName: string;
  onReport: () => void;
  onBlock: () => void;
}): void {
  Alert.alert(opts.senderName, undefined, [
    { text: 'Report message', style: 'destructive', onPress: opts.onReport },
    { text: `Block ${opts.senderName}`, style: 'destructive', onPress: opts.onBlock },
    { text: 'Cancel', style: 'cancel' },
  ]);
}
