import { useEffect } from 'react';
import { TextInput, type TextStyle, type StyleProp } from 'react-native';
import Animated, {
  Easing,
  useAnimatedProps,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

// Worklet-safe thousands separator (toLocaleString isn't reliable in worklets).
function withCommas(n: number): string {
  'worklet';
  const s = String(Math.round(n));
  let out = '';
  let count = 0;
  for (let i = s.length - 1; i >= 0; i--) {
    out = s[i] + out;
    count++;
    if (count % 3 === 0 && i > 0) out = ',' + out;
  }
  return out;
}

interface AnimatedNumberProps {
  value: number;
  duration?: number;
  style?: StyleProp<TextStyle>;
}

/** Counts up from 0 to `value` on mount/value-change (Robinhood-style). */
export function AnimatedNumber({ value, duration = 800, style }: AnimatedNumberProps) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = 0;
    progress.value = withTiming(value, {
      duration,
      easing: Easing.out(Easing.cubic),
    });
  }, [value, duration, progress]);

  const animatedProps = useAnimatedProps(() => {
    return { text: withCommas(progress.value), defaultValue: withCommas(progress.value) } as any;
  });

  return (
    <AnimatedTextInput
      editable={false}
      pointerEvents="none"
      underlineColorAndroid="transparent"
      style={style}
      value={withCommas(value)}
      animatedProps={animatedProps}
    />
  );
}
