import { StyleSheet, Text, type TextStyle, type StyleProp } from 'react-native';
import { Link } from 'expo-router';
import { parseDetailLink } from '@/lib/chat-share';

/** Only complete whitespace-delimited, supported detail paths become links. */
export function ChannelMessageText({
  content,
  style,
  compactLinks = false,
}: {
  content: string;
  style?: StyleProp<TextStyle>;
  compactLinks?: boolean;
}) {
  return (
    <Text style={style}>
      {content.split(/(\s+)/).map((part, index) => {
        const link = parseDetailLink(part);
        return link ? (
          <Link
            key={index}
            href={{
              pathname: link.kind === 'events' ? '/events/[id]' : '/jobs/[id]',
              params: { id: link.id },
            }}
            accessibilityLabel={`Open ${link.kind === 'events' ? 'event' : 'job posting'}`}
            style={{ textDecorationLine: 'underline', color: StyleSheet.flatten(style)?.color }}
          >
            {compactLinks ? (link.kind === 'events' ? 'View event' : 'View job posting') : part}
          </Link>
        ) : (
          part
        );
      })}
    </Text>
  );
}
