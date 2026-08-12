import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppBottomSheet } from '@/components/ui/AppBottomSheet';
import { AppText } from '@/components/ui/AppText';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';

const HOURS = Array.from({ length: 24 }, (_, index) => index);
const MINUTE_STEP = 5;
const MINUTES = Array.from({ length: 60 / MINUTE_STEP }, (_, index) => index * MINUTE_STEP);
const ROW_HEIGHT = 44;

const pad = (value: number) => String(value).padStart(2, '0');

/** Parses `HH:mm`; anything else falls back to the supplied default. */
function parseTime(value: string | null | undefined, fallbackHour: number) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value ?? '').trim());
  if (!match) return { hour: fallbackHour, minute: 0 };
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
    return { hour: fallbackHour, minute: 0 };
  }
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) {
    return { hour, minute: 0 };
  }
  // Snap to the step the wheel offers so the selection is always reachable.
  return { hour, minute: Math.round(minute / MINUTE_STEP) * MINUTE_STEP % 60 };
}

function Wheel({
  values,
  selected,
  onSelect,
  label,
}: {
  values: number[];
  selected: number;
  onSelect: (value: number) => void;
  label: string;
}) {
  const { theme } = useTheme();
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    const index = values.indexOf(selected);
    if (index < 0) return;
    // Land the current value near the middle rather than at the top, so the
    // neighbouring values are visible and the column reads as a dial.
    const offset = Math.max(0, index * ROW_HEIGHT - ROW_HEIGHT);
    const timeout = setTimeout(() => scrollRef.current?.scrollTo({ y: offset, animated: false }), 0);
    return () => clearTimeout(timeout);
  }, [selected, values]);

  return (
    <View style={styles.wheelWrap}>
      <AppText variant="captionBold" tone="secondary" style={styles.wheelLabel}>
        {label}
      </AppText>
      <ScrollView
        ref={scrollRef}
        style={[styles.wheel, { borderColor: theme.colors.border }]}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.wheelContent}
      >
        {values.map((value) => {
          const isSelected = value === selected;
          return (
            <Pressable
              key={value}
              onPress={() => onSelect(value)}
              accessibilityRole="radio"
              accessibilityState={{ checked: isSelected }}
              accessibilityLabel={`${label} ${pad(value)}`}
              style={[
                styles.wheelRow,
                isSelected ? { backgroundColor: theme.colors.primarySoft } : null,
              ]}
            >
              <AppText variant={isSelected ? 'bodyBold' : 'body'} tone={isSelected ? 'primary' : 'secondary'}>
                {pad(value)}
              </AppText>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

/**
 * A 24-hour time picker in a bottom sheet.
 *
 * Quiet hours used two free-text fields validated against `HH:mm` — the user
 * had to know the format, type it correctly, and find out on blur if they had
 * not. A time is a choice from a known set, so it gets a picker. Built from the
 * app's own sheet primitives rather than a native date-time module: adding a
 * native dependency mid-cycle forces a rebuild and breaks Expo Go, and nothing
 * here needs the platform widget.
 */
export function AppTimePickerSheet({
  visible,
  title,
  value,
  fallbackHour = 22,
  allowClear = true,
  onChange,
  onClose,
}: {
  visible: boolean;
  title: string;
  value: string | null;
  /** Hour to open on when no value is set yet. */
  fallbackHour?: number;
  allowClear?: boolean;
  onChange: (next: string | null) => void;
  onClose: () => void;
}) {
  const initial = useMemo(() => parseTime(value, fallbackHour), [fallbackHour, value]);
  const [hour, setHour] = useState(initial.hour);
  const [minute, setMinute] = useState(initial.minute);

  useEffect(() => {
    if (!visible) return;
    setHour(initial.hour);
    setMinute(initial.minute);
  }, [initial.hour, initial.minute, visible]);

  return (
    <AppBottomSheet
      visible={visible}
      title={title}
      headerMeta={`${pad(hour)}:${pad(minute)}`}
      onClose={onClose}
      onDone={() => {
        onChange(`${pad(hour)}:${pad(minute)}`);
        onClose();
      }}
      doneLabel="Set time"
      scrollable={false}
      keyboardBehavior="none"
    >
      <View style={styles.wheels}>
        <Wheel values={HOURS} selected={hour} onSelect={setHour} label="HOUR" />
        <Wheel values={MINUTES} selected={minute} onSelect={setMinute} label="MINUTE" />
      </View>
      {allowClear ? (
        <Pressable
          onPress={() => {
            onChange(null);
            onClose();
          }}
          accessibilityRole="button"
          style={styles.clearRow}
        >
          <AppText variant="smallBold" tone="danger">
            Clear time
          </AppText>
        </Pressable>
      ) : null}
    </AppBottomSheet>
  );
}

const styles = StyleSheet.create({
  wheels: {
    flexDirection: 'row',
    gap: tokens.spacing.lg,
  },
  wheelWrap: {
    flex: 1,
    gap: tokens.spacing.sm,
  },
  wheelLabel: {
    textAlign: 'center',
  },
  wheel: {
    maxHeight: ROW_HEIGHT * 5,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: tokens.radius.md,
  },
  wheelContent: {
    paddingVertical: tokens.spacing.xs,
  },
  wheelRow: {
    height: ROW_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearRow: {
    alignSelf: 'center',
    paddingVertical: tokens.spacing.md,
    paddingHorizontal: tokens.spacing.lg,
    marginTop: tokens.spacing.sm,
  },
});

export default AppTimePickerSheet;
