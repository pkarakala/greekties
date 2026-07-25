import { Component, type ReactNode } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Button } from '@/components/Button';
import { colors, spacing, typography } from '@/theme';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/** Catches render-time errors so a bad screen never white-screens the app. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.warn('[error-boundary]', error.message);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <View style={styles.container}>
        <Text style={styles.title}>Something went wrong</Text>
        <Text style={styles.body}>
          An unexpected error occurred. Try again, and if it keeps happening,
          restart the app.
        </Text>
        <Button
          label="Try again"
          fullWidth={false}
          onPress={() => this.setState({ error: null })}
        />
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.lg,
  },
  title: { ...typography.h1, color: colors.textPrimary, textAlign: 'center' },
  body: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },
});
