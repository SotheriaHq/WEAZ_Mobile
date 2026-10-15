import React from 'react';
import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { tokens } from '@/src/styles/tokens';

/**
 * Navigation that is a LINK, not a button.
 *
 * A button is a commitment: bag this, pay, delete. "See more" and "back to
 * Market" are neither — they move the reader sideways, and dressing them as
 * buttons put a bordered, filled control at the end of every section header and
 * at the bottom of every empty state, so a screen with six rows carried six
 * controls that all outranked the content they sat above.
 *
 * So they read as text: the system colour, italic, and a pointer glyph where
 * direction matters. Italic because it is the one typographic signal left that
 * says "aside" without adding weight, a border or a fill.
 */

const POINTER_BACK = String.fromCodePoint(0x2190);
const POINTER_FORWARD = String.fromCodePoint(0x2192);

interface InlineNavLinkProps {
  label: string;
  onPress: () => void;
  /** Which way this goes. Omit for no glyph. */
  direction?: 'back' | 'forward';
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
}

export function InlineNavLink({
  label,
  onPress,
  direction,
  accessibilityLabel,
  style,
  disabled = false,
}: InlineNavLinkProps) {
  const glyph = direction === 'back' ? POINTER_BACK : direction === 'forward' ? POINTER_FORWARD : null;
  const text = direction === 'back' && glyph ? `${glyph} ${label}` : glyph ? `${label} ${glyph}` : label;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={tokens.spacing.sm}
      accessibilityRole="link"
      accessibilityLabel={accessibilityLabel ?? label}
      style={({ pressed }) => [styles.link, pressed && styles.pressed, style]}
    >
      <AppText
        variant="captionBold"
        tone={disabled ? 'disabled' : 'primary'}
        numberOfLines={1}
        style={styles.label}
      >
        {text}
      </AppText>
    </Pressable>
  );
}

/** The one "there is more of this" affordance. Always italic, always the system colour. */
export function SeeMoreLink({
  onPress,
  /** What there is more of, for the screen reader. The visible label never changes. */
  ofWhat,
  style,
}: {
  onPress: () => void;
  ofWhat?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <InlineNavLink
      label="See more"
      direction="forward"
      onPress={onPress}
      accessibilityLabel={ofWhat ? `See more ${ofWhat}` : 'See more'}
      style={style}
    />
  );
}

/** Going back to a named place. The pointer carries the direction; the word names the place. */
export function BackLink({
  label,
  onPress,
  style,
}: {
  label: string;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  return <InlineNavLink label={label} direction="back" onPress={onPress} style={style} />;
}

const styles = StyleSheet.create({
  link: {
    alignSelf: 'flex-start',
    paddingVertical: tokens.spacing.xs,
  },
  label: {
    fontStyle: 'italic',
  },
  pressed: {
    opacity: 0.6,
  },
});
