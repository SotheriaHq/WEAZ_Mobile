/**
 * THE verification badge — the scalloped seal.
 *
 * Native was showing a bordered pill reading "✦ Verified": a sky-blue plate
 * with a four-pointed star in it. That is a label ABOUT verification rather
 * than the badge itself, it looked like a promotional chip rather than a mark
 * of trust, and — the part that actually matters — it looked nothing like the
 * seal web has shown on the same brand since `VerifiedBrandBadge.tsx` landed.
 * One brand, two apps, two different-looking claims about whether they are
 * verified is worse than either badge alone.
 *
 * So: the seal, on both clients, with the same silhouette.
 *
 * What is INSIDE the seal is the needle, not a checkmark. A tick is the generic
 * verification mark every platform uses; the needle is ours, it is the same
 * 🪡 vocabulary patching already speaks, and on a fashion-manufacture platform
 * "this maker is real" is the claim being made. It is drawn rather than set as
 * an emoji because an emoji inside a seal renders as a tiny picture pasted on a
 * badge — the wrong size, the wrong weight, and a different shape on every OS.
 *
 * Keep in step with `fthreadly/src/components/brand/VerifiedBrandBadge.tsx`.
 * The two are a deliberate cross-repo duplicate (separate repos, no shared
 * package) and nothing but this comment will notice them drifting.
 */
import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { useTheme } from '@/src/theme/ThemeProvider';

/** The scalloped outline, shared by every seal tone. */
const SEAL_PATH =
  'M22.5 12.5c0-1.58-.875-2.95-2.148-3.6.154-.435.238-.905.238-1.4 0-2.21-1.71-3.99-3.818-3.99-.48 0-.941.1-1.356.278C14.774 2.525 13.5 1.5 12 1.5s-2.774 1.025-3.416 2.288C8.17 3.6 7.708 3.5 7.23 3.5 5.12 3.5 3.41 5.28 3.41 7.49c0 .495.084.965.238 1.4-1.273.65-2.148 2.02-2.148 3.6 0 1.58.875 2.95 2.148 3.6-.154.435-.238.905-.238 1.4 0 2.21 1.71 3.99 3.818 3.99.48 0 .941-.1 1.356-.278C9.226 21.475 10.5 22.5 12 22.5s2.774-1.025 3.416-2.288c.415.178.876.278 1.356.278 2.108 0 3.818-1.78 3.818-3.99 0-.495-.084-.965-.238-1.4 1.273-.65 2.148-2.02 2.148-3.6z';

/**
 * The needle: a tapered shaft on the seal's diagonal with an open eye.
 *
 * Drawn on the diagonal for the same reason a real one is photographed that
 * way — it is the only orientation where a long thin object reads as a needle
 * rather than as a line. The eye is a stroked circle instead of a filled dot
 * because a hole is what makes it a needle; below about 20px the hole closes up
 * visually, which is why `MIN_LEGIBLE_SIZE` exists.
 */
const NEEDLE_PATH = 'M15.9 7.4 9.6 13.7l-1.3 3.1 3.1-1.3 6.3-6.3z';

/** Under this the needle's eye fills in and the mark stops reading. */
export const MIN_LEGIBLE_SIZE = 20;

export type VerifiedSealTone = 'brand' | 'store';

export function VerifiedSeal({
  size = 24,
  tone = 'brand',
  label = 'Verified brand',
  style,
}: {
  size?: number;
  tone?: VerifiedSealTone;
  label?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { theme } = useTheme();
  const rendered = Math.max(MIN_LEGIBLE_SIZE, size);
  const fill = tone === 'store' ? theme.colors.success : theme.colors.primary;
  const mark = theme.colors.onPrimary;

  return (
    <View
      style={style}
      accessibilityRole="image"
      accessibilityLabel={label}
    >
      <Svg width={rendered} height={rendered} viewBox="0 0 24 24">
        <Path d={SEAL_PATH} fill={fill} />
        <Path d={NEEDLE_PATH} fill={mark} />
        <Circle cx={16.9} cy={6.4} r={1.5} stroke={mark} strokeWidth={1.3} fill="none" />
      </Svg>
    </View>
  );
}

/**
 * Email verification is a TICK, not a badge.
 *
 * It is a housekeeping fact about an account, not a claim about a brand, and
 * giving it a chip of its own put it beside brand verification as though the
 * two were comparable. They are not: one says a link in an inbox was clicked,
 * the other says a human reviewed this business.
 */
export function EmailVerifiedTick({ size = 14 }: { size?: number }) {
  const { theme } = useTheme();
  return (
    <View accessibilityRole="image" accessibilityLabel="Email verified">
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Path
          d="M9.7 17.3 4 11.6l1.9-1.9 3.8 3.8L18.1 5.2 20 7.1z"
          fill={theme.colors.success}
        />
      </Svg>
    </View>
  );
}

/** Brand header size. Deliberately larger than the 24 default: the report was
 *  that the badge is not obvious enough, and the seal is the one mark on the
 *  header that has to be readable at arm's length. */
export const SEAL_HEADER_SIZE = 26;

export default VerifiedSeal;
