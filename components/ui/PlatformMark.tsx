/**
 * Real marks for third-party platforms.
 *
 * The contact row used emoji stand-ins — 📸 for Instagram, 📘 for Facebook,
 * ✖️ for X — on the reasoning that Rule 5 prefers an emoji over a custom SVG.
 * That reading does not survive contact with the thing it produced: a camera
 * next to a link that opens Instagram is not a weaker version of the Instagram
 * mark, it is a different symbol that says "photo". A shopper reads the row as
 * a photo gallery, presses it, and lands somewhere else entirely.
 *
 * Rule 5 governs OUR vocabulary — our actions, our states, our nouns — where an
 * emoji is warmer than a drawn icon and nothing is lost by choosing one. A
 * platform's mark is not our vocabulary. It is that platform's identity, it is
 * the only glyph a user recognises for it, and no emoji is a synonym for it.
 * So: when WIEZ references another platform anywhere in the UI, it uses that
 * platform's own mark.
 *
 * Everything that is genuinely ours (email, phone, website, QR) stays emoji,
 * because for those the emoji IS the recognised symbol.
 */
import React from 'react';
import { View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';

import { AppText } from '@/components/ui/AppText';

export type PlatformKey = 'instagram' | 'facebook' | 'x' | 'twitter';

/** Emoji markers for the non-platform rows — ours, so Rule 5 applies normally. */
const OWN_MARKERS: Record<string, string> = {
  email: '✉️',
  phone: '📞',
  website: '🌐',
  qr: '🔳',
};

const PLATFORM_KEYS: Record<string, PlatformKey> = {
  instagram: 'instagram',
  facebook: 'facebook',
  x: 'x',
  twitter: 'twitter',
};

/**
 * Brand colours are deliberately NOT used.
 *
 * A contact row is a list, and six differently-coloured logos in a column read
 * as advertising rather than as information. The marks are drawn in the row's
 * own ink, which is how every platform draws third-party marks in a settings
 * list. `currentColor` is not a thing in react-native-svg, so the colour is
 * passed explicitly.
 */
export function PlatformMark({
  platform,
  size = 16,
  color,
}: {
  platform: PlatformKey;
  size?: number;
  color: string;
}) {
  switch (platform) {
    case 'instagram':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Rect x={2} y={2} width={20} height={20} rx={5.5} stroke={color} strokeWidth={1.9} />
          <Path
            d="M12 7.6a4.4 4.4 0 1 0 0 8.8 4.4 4.4 0 0 0 0-8.8Zm0 1.9a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5Z"
            fill={color}
          />
          <Path d="M17.4 5.4a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5Z" fill={color} />
        </Svg>
      );
    case 'facebook':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Path
            d="M22 12.06C22 6.5 17.52 2 12 2S2 6.5 2 12.06c0 5.02 3.66 9.18 8.44 9.94v-7.03H7.9v-2.9h2.54V9.85c0-2.52 1.49-3.91 3.77-3.91 1.09 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.78-1.63 1.57v1.89h2.78l-.45 2.9h-2.33V22C18.34 21.24 22 17.08 22 12.06Z"
            fill={color}
          />
        </Svg>
      );
    case 'x':
    case 'twitter':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Path
            d="M17.53 3h3.02l-6.6 7.54L21.7 21h-6.07l-4.76-6.22L5.42 21H2.4l7.06-8.07L2.3 3h6.22l4.3 5.69L17.53 3Zm-1.06 16.17h1.67L7.6 4.73H5.81l10.66 14.44Z"
            fill={color}
          />
        </Svg>
      );
    default:
      return null;
  }
}

/**
 * One marker for a contact row, whichever kind it is.
 *
 * Callers pass the row's label rather than deciding for themselves which of the
 * two vocabularies applies — that decision belongs in one place, or the next
 * platform added elsewhere gets an emoji again.
 */
export function ContactMarker({
  label,
  color,
  size = 16,
}: {
  label: string;
  color: string;
  size?: number;
}) {
  const normalized = label.trim().toLowerCase();
  const platform = PLATFORM_KEYS[normalized];

  if (platform) {
    return (
      <View
        style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <PlatformMark platform={platform} size={size} color={color} />
      </View>
    );
  }

  return (
    <AppText
      variant="bodyReadable"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {OWN_MARKERS[normalized] ?? '🔗'}
    </AppText>
  );
}

export default PlatformMark;
