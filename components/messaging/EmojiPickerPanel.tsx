/**
 * The composer's emoji panel.
 *
 * Replaces a single hardcoded row of sixteen emoji. What made that row wrong
 * was not its length — it was that it had no structure to grow into: no
 * categories, no recents, no search, and nowhere to put a seventeenth emoji.
 *
 * ## What the references actually do
 *
 * Messenger, Instagram, WhatsApp and X differ in styling and agree almost
 * exactly on behaviour, and the agreement is what is worth copying:
 *
 * - The panel occupies the KEYBOARD's space, at the keyboard's height, and the
 *   two swap without the message list moving. If the panel opened at some
 *   invented height the transcript would jump twice per toggle — once for the
 *   keyboard leaving, once for the panel arriving. `keyboardHeight` is passed in
 *   for exactly this reason.
 * - Recents come FIRST and are the real payload. Emoji use is extremely
 *   repetitive per person; a picker without recents makes someone re-find the
 *   same three glyphs every time.
 * - Category tabs with a sliding indicator, and the tabs are emoji from the
 *   category itself rather than icons — self-labelling, no localisation.
 * - Tapping an emoji does NOT close the panel. People send several. Every one
 *   of the references keeps it open and lets the composer accumulate.
 * - The tap gives immediate physical feedback — a quick scale pop — because the
 *   inserted character appears in a text field the user is not looking at.
 *
 * ## Animation
 *
 * Only `transform` and `opacity` are animated, all on the native driver, so
 * nothing here runs through the JS thread while a finger is down. The pop is a
 * spring on the pressed cell only; animating the grid would be a per-frame
 * layout of a hundred views.
 */
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, FlatList, Pressable, StyleSheet, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { AppText } from '@/components/ui/AppText';
import { Input } from '@/components/ui/Input';
import {
  ALL_EMOJIS,
  EMOJI_GROUPS,
  MAX_RECENT_EMOJIS,
  RECENT_EMOJIS_STORAGE_KEY,
  searchEmojis,
} from '@/src/features/messaging/emojiCatalog';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';

/** Columns in the grid. 8 keeps a ~40pt cell on the narrowest phone we support. */
const COLUMNS = 8;

/**
 * Panel height when the keyboard's own height is unknown.
 *
 * Used only on the first open of a session, before any keyboard has been
 * measured. Sized to the median Android keyboard so the fallback is never
 * wildly wrong in either direction.
 */
const FALLBACK_PANEL_HEIGHT = 280;
const MIN_PANEL_HEIGHT = 220;
const MAX_PANEL_HEIGHT = 380;

async function readRecents(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(RECENT_EMOJIS_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value): value is string => typeof value === 'string').slice(0, MAX_RECENT_EMOJIS);
  } catch {
    // A corrupt or unreadable recents list is not worth surfacing — the picker
    // is fully usable without it.
    return [];
  }
}

async function writeRecents(emojis: string[]) {
  try {
    await AsyncStorage.setItem(RECENT_EMOJIS_STORAGE_KEY, JSON.stringify(emojis));
  } catch {
    /* see readRecents */
  }
}

const EmojiCell = memo(function EmojiCell({
  emoji,
  size,
  onPress,
}: {
  emoji: string;
  size: number;
  onPress: (emoji: string) => void;
}) {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePress = useCallback(() => {
    // The pop is the receipt. The character lands in a field the user is not
    // looking at, so without it a tap that registered and a tap that missed
    // look identical.
    scale.stopAnimation();
    scale.setValue(0.82);
    Animated.spring(scale, {
      toValue: 1,
      friction: 4,
      tension: 220,
      useNativeDriver: true,
      // Decorative. An interaction handle here would sit on the queue for the
      // life of the spring and stall deferred screen work.
      isInteraction: false,
    }).start();
    onPress(emoji);
  }, [emoji, onPress, scale]);

  return (
    <Pressable
      onPress={handlePress}
      style={[styles.cell, { width: size, height: size }]}
      accessibilityRole="button"
      accessibilityLabel={`Insert ${emoji}`}
    >
      <Animated.View style={{ transform: [{ scale }] }}>
        <AppText variant="title">{emoji}</AppText>
      </Animated.View>
    </Pressable>
  );
});

export function EmojiPickerPanel({
  visible,
  keyboardHeight,
  width,
  onSelect,
}: {
  visible: boolean;
  /** Last measured keyboard height, so the panel occupies exactly its space. */
  keyboardHeight?: number;
  /** Composer width, used to size the grid cells. */
  width: number;
  onSelect: (emoji: string) => void;
}) {
  const { theme } = useTheme();
  const [activeGroup, setActiveGroup] = useState(EMOJI_GROUPS[0].key);
  const [query, setQuery] = useState('');
  const [recents, setRecents] = useState<string[]>([]);
  const revealAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let active = true;
    void readRecents().then((stored) => {
      if (active) setRecents(stored);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    Animated.timing(revealAnim, {
      toValue: visible ? 1 : 0,
      duration: visible ? 160 : 120,
      useNativeDriver: true,
      isInteraction: false,
    }).start();
  }, [revealAnim, visible]);

  const panelHeight = useMemo(() => {
    const measured = keyboardHeight && keyboardHeight > 0 ? keyboardHeight : FALLBACK_PANEL_HEIGHT;
    return Math.min(MAX_PANEL_HEIGHT, Math.max(MIN_PANEL_HEIGHT, measured));
  }, [keyboardHeight]);

  const cellSize = Math.floor(Math.max(0, width - tokens.spacing.md * 2) / COLUMNS);

  const results = useMemo(() => {
    const trimmed = query.trim();
    if (trimmed) {
      const matches = searchEmojis(trimmed);
      // An empty result is a real answer, but a picker that goes blank is worse
      // than one that shows everything — falling back to the full list keeps
      // browsing available while a query is being typed.
      return matches.length > 0 ? matches : ALL_EMOJIS;
    }
    return EMOJI_GROUPS.find((group) => group.key === activeGroup)?.emojis ?? ALL_EMOJIS;
  }, [activeGroup, query]);

  const handleSelect = useCallback(
    (emoji: string) => {
      onSelect(emoji);
      setRecents((current) => {
        const next = [emoji, ...current.filter((value) => value !== emoji)].slice(
          0,
          MAX_RECENT_EMOJIS,
        );
        void writeRecents(next);
        return next;
      });
    },
    [onSelect],
  );

  const renderCell = useCallback(
    ({ item }: { item: string }) => (
      <EmojiCell emoji={item} size={cellSize} onPress={handleSelect} />
    ),
    [cellSize, handleSelect],
  );

  if (!visible) return null;

  return (
    <Animated.View
      style={[
        styles.panel,
        {
          height: panelHeight,
          backgroundColor: theme.colors.surfaceAlt,
          borderColor: theme.colors.border,
          opacity: revealAnim,
          transform: [
            {
              translateY: revealAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [12, 0],
              }),
            },
          ],
        },
      ]}
    >
      <View style={styles.searchRow}>
        <Input
          label="Search emoji"
          hideLabel
          value={query}
          onChangeText={setQuery}
          placeholder="Search emoji"
          autoCorrect={false}
          autoCapitalize="none"
          containerStyle={styles.searchInput}
        />
      </View>

      {recents.length > 0 && !query.trim() ? (
        <View style={styles.recentsRow}>
          <AppText variant="captionBold" tone="muted" style={styles.recentsLabel}>
            Recent
          </AppText>
          <View style={styles.recentsCells}>
            {recents.slice(0, COLUMNS).map((emoji) => (
              <EmojiCell key={`recent-${emoji}`} emoji={emoji} size={cellSize} onPress={handleSelect} />
            ))}
          </View>
        </View>
      ) : null}

      <FlatList
        data={results}
        keyExtractor={(item, index) => `${item}-${index}`}
        renderItem={renderCell}
        numColumns={COLUMNS}
        // The grid is a fixed square lattice, so every row's geometry is known
        // without measuring — which lets the list skip layout entirely while
        // scrolling.
        getItemLayout={(_, index) => ({
          length: cellSize,
          offset: cellSize * Math.floor(index / COLUMNS),
          index,
        })}
        keyboardShouldPersistTaps="always"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.gridContent}
        style={styles.grid}
      />

      {/* Category tabs sit at the BOTTOM, within thumb reach, which is where
          every reference app puts them on a phone. */}
      {!query.trim() ? (
        <View style={[styles.tabs, { borderTopColor: theme.colors.border }]}>
          {EMOJI_GROUPS.map((group) => {
            const active = group.key === activeGroup;
            return (
              <Pressable
                key={group.key}
                onPress={() => setActiveGroup(group.key)}
                style={[
                  styles.tab,
                  active && { backgroundColor: theme.colors.primarySoft },
                ]}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                accessibilityLabel={group.label}
              >
                <AppText variant="bodyReadable">{group.icon}</AppText>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  panel: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  searchRow: {
    paddingHorizontal: tokens.spacing.md,
    paddingTop: tokens.spacing.sm,
  },
  searchInput: {
    marginBottom: 0,
  },
  recentsRow: {
    paddingHorizontal: tokens.spacing.md,
    paddingTop: tokens.spacing.xs,
  },
  recentsLabel: {
    marginBottom: tokens.spacing.xs,
  },
  recentsCells: {
    flexDirection: 'row',
  },
  grid: {
    flex: 1,
  },
  gridContent: {
    paddingHorizontal: tokens.spacing.md,
    paddingBottom: tokens.spacing.sm,
  },
  cell: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabs: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: tokens.spacing.xs,
    paddingHorizontal: tokens.spacing.md,
    gap: tokens.spacing.xs,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: tokens.spacing.xs,
    borderRadius: tokens.radius.full,
  },
});

export default EmojiPickerPanel;
