import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, G, Line, Path } from 'react-native-svg';

import type { CoreMeasurementKey } from '@/src/features/sizing/measurementCatalog';
import { useTheme } from '@/src/theme/ThemeProvider';

/**
 * A body with the measuring lines drawn on it.
 *
 * "Waist — around the narrowest part, above the belly button" is a good
 * sentence and still leaves a first-time shopper unsure where the tape goes.
 * A line across a body answers that at a glance, which is why the web charts
 * page has one and the app had none.
 *
 * Ported from the web `MeasurementSilhouetteVisualizer` (same 400 × 620 figure,
 * same landmark coordinates) and keyed by the eight points the fittings screen
 * collects, so the charts screen and the fittings screen point at the same
 * spots on the same body.
 *
 * No text is drawn inside the SVG. The selected point is named underneath with
 * `AppText`, where it follows the type scale, scales with the system font size,
 * and is read by a screen reader — none of which an SVG label does.
 */

const VIEWBOX_WIDTH = 400;
const VIEWBOX_HEIGHT = 620;

type Marker = {
  key: CoreMeasurementKey;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** Where the pin sits; also the centre of the touch target. */
  markerX: number;
  markerY: number;
  /** Girths get calliper end-caps; lengths do not. */
  girth: boolean;
};

const MARKERS: readonly Marker[] = [
  { key: 'HEIGHT', x1: 350, y1: 18, x2: 350, y2: 600, markerX: 350, markerY: 300, girth: false },
  { key: 'NECK_COLLAR', x1: 185, y1: 85, x2: 215, y2: 85, markerX: 228, markerY: 80, girth: true },
  { key: 'SHOULDER', x1: 130, y1: 105, x2: 270, y2: 105, markerX: 282, markerY: 105, girth: true },
  { key: 'CHEST_BUST', x1: 135, y1: 168, x2: 265, y2: 168, markerX: 277, markerY: 168, girth: true },
  { key: 'WAIST', x1: 152, y1: 235, x2: 248, y2: 235, markerX: 260, markerY: 235, girth: true },
  { key: 'HIP_SEAT', x1: 140, y1: 320, x2: 260, y2: 320, markerX: 272, markerY: 320, girth: true },
  { key: 'SLEEVE_LENGTH', x1: 125, y1: 110, x2: 85, y2: 295, markerX: 72, markerY: 200, girth: false },
  { key: 'INSEAM', x1: 195, y1: 340, x2: 180, y2: 570, markerX: 188, markerY: 455, girth: false },
];

/** The figure itself — mannequin outline, same paths as the web. */
const BODY_PATHS = [
  // Head & neck
  'M 185 85 C 175 75, 172 55, 175 35 C 178 15, 222 15, 225 35 C 228 55, 225 75, 215 85 L 215 95 L 185 95 Z',
  // Torso & shoulders
  'M 185 95 L 130 110 C 120 120, 115 150, 125 180 L 135 210 C 142 225, 150 235, 152 245 C 150 260, 142 280, 140 310 C 138 335, 142 350, 148 360 L 195 360 L 195 340 L 205 340 L 205 360 L 252 360 C 258 350, 262 335, 260 310 C 258 280, 250 260, 248 245 C 250 235, 258 225, 265 210 L 275 180 C 285 150, 280 120, 270 110 L 215 95 Z',
  // Left leg
  'M 148 360 C 145 400, 150 450, 155 480 C 158 510, 155 540, 160 575 C 162 585, 150 595, 160 600 L 185 600 C 188 590, 185 575, 185 570 C 185 540, 192 510, 190 480 C 188 450, 195 400, 195 360',
  // Right leg
  'M 252 360 C 255 400, 250 450, 245 480 C 242 510, 245 540, 240 575 C 238 585, 250 595, 240 600 L 215 600 C 212 590, 215 575, 215 570 C 215 540, 208 510, 210 480 C 212 450, 205 400, 205 360',
] as const;

const ARM_PATHS = [
  'M 125 112 C 110 125, 95 160, 92 195 C 88 230, 85 260, 75 300 C 72 315, 68 330, 72 340 C 76 345, 82 342, 85 330 C 92 295, 100 250, 108 210 L 125 170',
  'M 275 112 C 290 125, 305 160, 308 195 C 312 230, 315 260, 325 300 C 328 315, 332 330, 328 340 C 324 345, 318 342, 315 330 C 308 295, 300 250, 292 210 L 275 170',
] as const;

/**
 * Touch radius in viewBox units. The figure renders at roughly two-thirds
 * scale on a phone, so 26 lands near a 36pt target — close to the 44pt
 * guideline without the neck and shoulder targets overlapping. The point list
 * under the figure is the accessible way in; these are a shortcut.
 */
const HIT_RADIUS = 26;

export type MeasurementSilhouetteProps = {
  /** Which points to draw. Defaults to all eight. */
  pointKeys?: readonly CoreMeasurementKey[];
  activeKey: CoreMeasurementKey | null;
  onSelect?: (key: CoreMeasurementKey) => void;
  /** Rendered width; height follows the figure's proportions. */
  width: number;
};

function MeasurementSilhouetteBase({
  pointKeys,
  activeKey,
  onSelect,
  width,
}: MeasurementSilhouetteProps) {
  const { theme } = useTheme();
  const height = (width * VIEWBOX_HEIGHT) / VIEWBOX_WIDTH;
  const visible = pointKeys
    ? MARKERS.filter((marker) => pointKeys.includes(marker.key))
    : MARKERS;

  return (
    <View
      style={[styles.frame, { width, height }]}
      accessible
      accessibilityRole="image"
      accessibilityLabel="Body diagram showing where each measurement is taken"
    >
      <Svg width={width} height={height} viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}>
        <G>
          {BODY_PATHS.map((d) => (
            <Path
              key={d}
              d={d}
              fill={theme.colors.textSecondary}
              fillOpacity={0.06}
              stroke={theme.colors.textSecondary}
              strokeOpacity={0.4}
              strokeWidth={1.5}
              strokeLinejoin="round"
            />
          ))}
          {ARM_PATHS.map((d) => (
            <Path
              key={d}
              d={d}
              fill="none"
              stroke={theme.colors.textSecondary}
              strokeOpacity={0.35}
              strokeWidth={1.5}
              strokeLinecap="round"
            />
          ))}
        </G>

        {/*
          Inactive lines are dashed and faint so the figure reads as a whole;
          the selected one goes solid and full-strength, so the eye lands on it
          without a legend.
        */}
        {visible.map((marker) => {
          const active = marker.key === activeKey;
          const stroke = theme.colors.primary;
          return (
            <G key={marker.key} onPress={onSelect ? () => onSelect(marker.key) : undefined}>
              <Line
                x1={marker.x1}
                y1={marker.y1}
                x2={marker.x2}
                y2={marker.y2}
                stroke={stroke}
                strokeWidth={active ? 3.5 : 1.5}
                strokeOpacity={active ? 1 : 0.45}
                strokeDasharray={active ? undefined : '5 4'}
                strokeLinecap="round"
              />
              {marker.girth ? (
                <>
                  <Line
                    x1={marker.x1}
                    y1={marker.y1 - 5}
                    x2={marker.x1}
                    y2={marker.y1 + 5}
                    stroke={stroke}
                    strokeWidth={active ? 2.5 : 1.5}
                    strokeOpacity={active ? 1 : 0.6}
                  />
                  <Line
                    x1={marker.x2}
                    y1={marker.y2 - 5}
                    x2={marker.x2}
                    y2={marker.y2 + 5}
                    stroke={stroke}
                    strokeWidth={active ? 2.5 : 1.5}
                    strokeOpacity={active ? 1 : 0.6}
                  />
                </>
              ) : null}
              {active ? (
                // A soft halo, not a glow filter: filters are expensive on
                // Android and this redraws on every selection.
                <Circle
                  cx={marker.markerX}
                  cy={marker.markerY}
                  r={14}
                  fill={stroke}
                  fillOpacity={0.18}
                />
              ) : null}
              <Circle
                cx={marker.markerX}
                cy={marker.markerY}
                r={active ? 7 : 5}
                fill={stroke}
                stroke={theme.colors.surface}
                strokeWidth={2}
              />
              {/* Invisible, generous touch target over the pin. */}
              <Circle cx={marker.markerX} cy={marker.markerY} r={HIT_RADIUS} fill="transparent" />
            </G>
          );
        })}
      </Svg>
    </View>
  );
}

export const MeasurementSilhouette = memo(MeasurementSilhouetteBase);

const styles = StyleSheet.create({
  frame: {
    alignSelf: 'center',
  },
});

export default MeasurementSilhouette;
