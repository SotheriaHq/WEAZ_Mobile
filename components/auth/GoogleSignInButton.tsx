import React, { useCallback, useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { GoogleMark } from '@/components/auth/GoogleMark';
import { MuseLoader } from '@/components/ui/MuseLoader';
import { useTheme } from '@/src/theme/ThemeProvider';

/**
 * Sign in with Google — the mark, and nothing else.
 *
 * This is its own component rather than `<Button title="" left={<GoogleMark/>}/>`
 * because a button with no visible text has no accessible name. `Button` gets
 * its name from the label it renders, so an empty title would ship a control
 * that a screen reader announces as nothing at all. The name has to be stated
 * explicitly, and a control shaped that differently — a circle, fixed size,
 * centred, no label slot — earns its own component instead of a mode flag on
 * the text button.
 *
 * `accessibilityLabel` stays the full sentence. Dropping the words is a visual
 * decision; it is not a reason to make the control anonymous to anyone who
 * cannot see the mark.
 */

/** iOS HIG and Material both floor a tap target at 44dp. */
const SIZE = 56;

type Props = {
  onPress: () => void | Promise<unknown>;
  loading?: boolean;
  disabled?: boolean;
  label?: string;
  testID?: string;
};

export function GoogleSignInButton({
  onPress,
  loading = false,
  disabled = false,
  label = 'Continue with Google',
  testID,
}: Props) {
  const { theme } = useTheme();
  const lastPressRef = useRef(0);

  // Same single-fire guard the text Button carries: under SIT latency a press
  // can take seconds to show feedback, and the second press starts a second
  // OAuth session.
  const handlePress = useCallback(() => {
    const now = Date.now();
    if (now - lastPressRef.current < 650) return;
    lastPressRef.current = now;
    void onPress();
  }, [onPress]);

  const inert = disabled || loading;

  return (
    <View style={styles.row}>
      <Pressable
        testID={testID}
        onPress={handlePress}
        disabled={inert}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: inert, busy: loading }}
        hitSlop={8}
        style={({ pressed }) => [
          styles.button,
          {
            backgroundColor: pressed ? theme.colors.surfaceAlt : theme.colors.surface,
            borderColor: disabled ? theme.colors.disabledBorder : theme.colors.border,
            opacity: disabled ? 0.5 : 1,
          },
        ]}
      >
        {loading ? <MuseLoader size={24} /> : <GoogleMark size={26} />}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
  },
  button: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    borderWidth: StyleSheet.hairlineWidth * 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default GoogleSignInButton;
