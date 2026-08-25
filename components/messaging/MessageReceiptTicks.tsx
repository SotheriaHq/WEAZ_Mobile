/**
 * Delivery ticks for a sent message — STACKED, not side by side.
 *
 * These were the text string `'✓✓'`: two check glyphs on one baseline, so at
 * caption size a delivered message read as a wide double-width mark that is
 * hard to tell from a single tick at a glance, and the pair took roughly twice
 * the horizontal room in a metadata row that already holds a timestamp.
 *
 * Stacking is what the reference messengers do and it is not decoration: two
 * checks offset VERTICALLY overlap in the same footprint as one, so the
 * one-tick/two-tick difference reads as density rather than as width, and the
 * row's geometry does not change when a receipt arrives. A metadata row that
 * reflows the moment a message is delivered is a visible twitch under the
 * message somebody just sent.
 *
 * Drawn rather than set as type. Two `AppText`s cannot be overlapped reliably —
 * emoji/glyph metrics differ per platform and per font fallback, so the offset
 * that looks right on one device is wrong on the next. An SVG has exact
 * geometry everywhere.
 */
import React from 'react';
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { AppText } from '@/components/ui/AppText';

export type ReceiptState = 'SENDING' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED';

/** One check, drawn in a 24x24 box so both copies share a coordinate system. */
const CHECK = 'M9.2 15.9 4.9 11.6l1.6-1.6 2.7 2.7 8.3-8.3 1.6 1.6z';

/** How far the second check sits below the first, in viewBox units. */
const STACK_OFFSET = 6.5;

export function MessageReceiptTicks({
  state,
  size = 15,
  /** Bubble ink, so the ticks belong to the bubble rather than float on it. */
  color,
  readColor,
}: {
  state: ReceiptState;
  size?: number;
  color: string;
  readColor: string;
}) {
  // Sending shows a clock, never a tick. Claiming "sent" before the request
  // resolves is the one thing a delivery indicator must not do.
  if (state === 'SENDING') {
    return (
      <AppText variant="captionRegular" tone="inverse" accessibilityLabel="Sending">
        🕘
      </AppText>
    );
  }

  if (state === 'FAILED') {
    return (
      <AppText variant="captionBold" tone="danger" accessibilityLabel="Not sent">
        !
      </AppText>
    );
  }

  const doubled = state === 'DELIVERED' || state === 'READ';
  const tint = state === 'READ' ? readColor : color;
  const label = state === 'READ' ? 'Read' : doubled ? 'Delivered' : 'Sent';

  /*
    The stack is taller than it is wide, so the box is sized on the taller axis
    and the viewBox is cropped to the marks. Both checks always render at the
    same coordinates; only the second one's presence changes, so nothing shifts
    between states.
  */
  const viewBoxHeight = 24 + (doubled ? STACK_OFFSET : 0);

  return (
    <View accessibilityRole="image" accessibilityLabel={label}>
      <Svg
        width={size}
        height={size * (viewBoxHeight / 24)}
        viewBox={`0 0 24 ${viewBoxHeight}`}
      >
        <Path d={CHECK} fill={tint} />
        {doubled ? (
          <Path d={CHECK} fill={tint} transform={`translate(0 ${STACK_OFFSET})`} />
        ) : null}
      </Svg>
    </View>
  );
}

export default MessageReceiptTicks;
