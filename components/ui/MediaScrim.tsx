import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { tokens } from '@/src/styles/tokens';

/**
 * Legibility scrim for text and controls laid over a photograph.
 *
 * ## Why this exists
 *
 * Every card, hero and tile that puts white text on artwork needs the pixels
 * *under that text* darkened. What they all did instead was drop one
 * `LinearGradient` across `StyleSheet.absoluteFill` — a veil over the entire
 * image, including the middle, where nothing is written and the garment is.
 *
 * Measured, before this component: the market product card ramped
 * `backdrop → backdropStrong` head to foot, which on the dark theme is **58% to
 * 80% black over the whole photograph** (22%→40% on light). The market hero ran
 * `backdropStrong → backdrop → backdropStrong`, so its brightest point was 42%.
 * The editorial card ran `backdropStrong → primaryDark → backdropStrong`, and
 * `primaryDark` is an **opaque** violet — the middle third of that card was a
 * solid purple band with the photograph completely hidden behind it.
 *
 * That is the "cards look dull, like they're under a grey background" report,
 * and no amount of theme work fixes it: the artwork was being deleted before
 * the theme ever got a say.
 *
 * ## The rule
 *
 * Darken the BANDS, not the picture. A scrim reaches in from the edge it
 * protects and is fully transparent before it reaches the subject. Anything
 * that needs to read over the untouched middle carries its own treatment — a
 * text shadow, a plate, a blur — because it is a local problem.
 *
 * ## Not shouty either
 *
 * The counterpart failure is a grid where every card fights for attention. The
 * answer is not more contrast per card; it is that the photograph is the only
 * loud thing on a card and the frame around it stays quiet. Keep `strength` at
 * `'standard'` unless white text genuinely lands on a pale image, and keep
 * `reach` to the band the copy actually occupies.
 */

export type ScrimEdge = 'top' | 'bottom';

/**
 * Peak alpha at the protected edge.
 *
 * - `light`    — a badge or a glyph that already carries a text shadow.
 * - `standard` — a line or two of white copy.
 * - `strong`   — dense copy, or copy that must survive a white garment.
 */
const EDGE_ALPHA = {
  light: 0.42,
  standard: 0.62,
  strong: 0.78,
} as const;

export type ScrimStrength = keyof typeof EDGE_ALPHA;

type MediaScrimProps = {
  /** Which edges carry copy or controls. Omit an edge and it stays untouched. */
  edges: ScrimEdge[];
  /**
   * How far the scrim reaches in from each edge, as a fraction of the media's
   * height. Defaults to a third — enough for a title and a meta row, and it
   * leaves the middle half of the frame completely clear.
   */
  reach?: number;
  strength?: ScrimStrength;
  style?: StyleProp<ViewStyle>;
};

/**
 * A three-stop ramp rather than two.
 *
 * A straight two-stop gradient is linear in alpha, so it is still at half
 * strength at the halfway mark and the eye reads a hard diagonal edge where it
 * finally clears. Pulling the midpoint down to a third of the peak makes the
 * falloff read as light rather than as a shape.
 */
function ramp(alpha: number, fromEdge: boolean): [string, string, string] {
  const stops: [string, string, string] = [
    tokens.scrim(alpha),
    tokens.scrim(alpha * 0.32),
    tokens.scrim(0),
  ];
  return fromEdge ? stops : ([stops[2], stops[1], stops[0]] as [string, string, string]);
}

export function MediaScrim({
  edges,
  reach = 0.34,
  strength = 'standard',
  style,
}: MediaScrimProps) {
  const alpha = EDGE_ALPHA[strength];
  const band = `${Math.round(Math.max(0, Math.min(1, reach)) * 100)}%` as const;

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, style]}>
      {edges.includes('top') ? (
        <LinearGradient
          pointerEvents="none"
          colors={ramp(alpha, true)}
          locations={[0, 0.55, 1]}
          style={[styles.edge, styles.top, { height: band }]}
        />
      ) : null}
      {edges.includes('bottom') ? (
        <LinearGradient
          pointerEvents="none"
          colors={ramp(alpha, false)}
          locations={[0, 0.45, 1]}
          style={[styles.edge, styles.bottom, { height: band }]}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  edge: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
  top: { top: 0 },
  bottom: { bottom: 0 },
});

export default MediaScrim;
