import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { TOKENS } from '../../constants/tokens';

type FallbackProps = { error: Error; retry: () => void };

/**
 * Friendly screen shown instead of a hard crash. Used both as the
 * expo-router route `ErrorBoundary` and by the class boundary below.
 */
export function ErrorFallback({ error, retry }: FallbackProps) {
  return (
    <View style={styles.container}>
      <View style={styles.iconBox}>
        <Feather name="alert-triangle" size={28} color="#B45309" />
      </View>
      <Text style={styles.title}>Something went wrong</Text>
      <Text style={styles.subtitle}>
        The screen hit an unexpected error. Your data is safe. Tap below to try again.
      </Text>
      {/* Shown in every build: on TestFlight this line is the only clue to
          what actually threw, since there is no Metro console to read. */}
      <Text style={styles.debug} numberOfLines={8} selectable>
        {error?.message || String(error)}
      </Text>
      <TouchableOpacity style={styles.button} activeOpacity={0.8} onPress={retry}>
        <Feather name="refresh-cw" size={16} color="#FFFFFF" />
        <Text style={styles.buttonText}>Try again</Text>
      </TouchableOpacity>
    </View>
  );
}

type State = { error: Error | null };

/**
 * Last line of defence around the whole app tree. Anything a route-level
 * ErrorBoundary does not catch (providers, the splash, the tab bar) lands
 * here instead of killing the process.
 */
export class AppErrorBoundary extends React.Component<React.PropsWithChildren, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[AppErrorBoundary]', error, info.componentStack);
  }

  retry = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      return <ErrorFallback error={this.state.error} retry={this.retry} />;
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 12,
  },
  iconBox: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  title: { fontSize: 20, fontWeight: '700', color: TOKENS.dark, textAlign: 'center' },
  subtitle: { fontSize: 14, color: TOKENS.muted, textAlign: 'center', lineHeight: 20 },
  debug: {
    fontSize: 12,
    color: '#B91C1C',
    textAlign: 'center',
    fontFamily: 'Menlo',
    marginTop: 4,
  },
  button: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: TOKENS.primary,
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 999,
  },
  buttonText: { color: '#FFFFFF', fontWeight: '600', fontSize: 15 },
});
