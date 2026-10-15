/**
 * The emoji vocabulary for the composer.
 *
 * The composer used to offer exactly sixteen emoji — a single hardcoded row —
 * so anything a person actually wanted to say was unavailable. Nothing about
 * that was a size decision; it was a placeholder ("Lightweight emoji row (no
 * extra dependency)") that shipped.
 *
 * ## Why a bundled list rather than a package
 *
 * Emoji are just strings, so a picker needs data, not a native module. The
 * candidate packages either ship a native dependency (which needs a rebuild and
 * cannot reach an installed app) or bundle a 1MB+ JSON of every emoji with every
 * shortcode and locale. This list is the emoji people actually send in a
 * shopping conversation about clothes, grouped the way every messenger groups
 * them, at a size that costs nothing to parse at startup.
 *
 * ## Ordering
 *
 * Within each group the order is frequency-of-use, not codepoint order. A grid
 * is scanned from the top-left, so the emoji someone is most likely to want has
 * to be the first one their eye lands on — codepoint order buries 😂 behind
 * two dozen faces nobody sends.
 *
 * Skin-tone variants are deliberately excluded. They multiply every hand and
 * person by six for a preference the platform keyboard already remembers, and
 * the system keyboard remains one tap away for anything not here.
 */

export type EmojiGroup = {
  key: string;
  /** Tab marker — an emoji from the group itself, which is how every messenger labels these. */
  icon: string;
  label: string;
  emojis: string[];
};

export const EMOJI_GROUPS: EmojiGroup[] = [
  {
    key: 'reactions',
    icon: '😀',
    label: 'Smileys & people',
    emojis: [
      '😂', '🥹', '😍', '🥰', '😊', '🙂', '😉', '😌', '😎', '🤩',
      '😅', '😄', '😁', '😆', '🤣', '🙃', '😇', '🤗', '🤔', '🤨',
      '😐', '😶', '🙄', '😴', '🤤', '😋', '😛', '😜', '🤪', '😝',
      '🥲', '😢', '😭', '😤', '😠', '😡', '🥺', '😳', '🤯', '😱',
      '😬', '😰', '😨', '🤥', '🤫', '🤭', '😷', '🤒', '🤕', '🤢',
      '👋', '🤝', '👍', '👎', '👏', '🙌', '🙏', '💪', '🤞', '✌️',
      '👌', '🤌', '☝️', '👆', '👇', '👉', '👈', '✋', '🖐️', '🤙',
      '💅', '👀', '🧠', '🫶', '🤲', '🙋', '🤷', '🤦', '💁', '🕺',
      '💃', '🧵', '🪡', '🧶', '👗', '👚', '👕', '👖', '🧥', '👘',
      '👔', '🥻', '🩱', '👙', '👠', '👟', '👞', '🥿', '👜', '👛',
    ],
  },
  {
    key: 'hearts',
    icon: '❤️',
    label: 'Hearts & symbols',
    emojis: [
      '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💖',
      '💗', '💓', '💞', '💕', '💘', '💝', '💯', '✨', '⭐', '🌟',
      '💫', '🔥', '⚡', '💥', '🎉', '🎊', '🥳', '🎁', '🏆', '🥇',
      '✅', '☑️', '❌', '⭕', '❗', '❓', '💬', '👑', '💎', '🔔',
    ],
  },
  {
    key: 'commerce',
    icon: '🛍️',
    label: 'Shopping & delivery',
    emojis: [
      '🛍️', '👜', '🎽', '📦', '🚚', '✈️', '📍', '🗓️', '⏰', '⌛',
      '💰', '💵', '💳', '🧾', '🏷️', '🔖', '📏', '📐', '✂️', '🪢',
      '🧺', '🧴', '🪞', '🖼️', '📸', '🎬', '🔍', '🔎', '📝', '📌',
    ],
  },
  {
    key: 'places',
    icon: '🌍',
    label: 'Travel & nature',
    emojis: [
      '🌍', '🌦️', '☀️', '🌙', '🌈', '🌸', '🌺', '🌻', '🌹', '🌿',
      '🍃', '🌴', '🏝️', '🏙️', '🏠', '🚗', '🛵', '🚲', '⛵', '🎡',
      '🍽️', '☕', '🍵', '🥤', '🍰', '🍫', '🍓', '🍊', '🥑', '🍯',
    ],
  },
];

/** Flat list, for search and for the "all" fallback. */
export const ALL_EMOJIS: string[] = EMOJI_GROUPS.flatMap((group) => group.emojis);

/**
 * Keywords, for the search field.
 *
 * Only the emoji whose name is NOT guessable from the glyph get an entry —
 * everything else is found by browsing, which is how emoji are actually
 * chosen. Keeping this small is the point: a full shortcode table is most of
 * the weight of an emoji package for a feature people use by looking.
 */
export const EMOJI_KEYWORDS: Record<string, string> = {
  '😂': 'laugh cry funny lol',
  '🥹': 'grateful touched happy tears',
  '😍': 'love heart eyes adore',
  '🥰': 'love smile affection',
  '😎': 'cool sunglasses',
  '🤩': 'star struck amazed wow',
  '🤔': 'think hmm consider',
  '🙏': 'please thanks pray',
  '👍': 'yes ok good approve thumbs up',
  '👎': 'no bad thumbs down',
  '👏': 'clap applause well done',
  '🙌': 'celebrate praise hooray',
  '💪': 'strong power flex',
  '🔥': 'fire hot amazing lit',
  '💯': 'hundred perfect exactly',
  '✨': 'sparkle new shiny',
  '🎉': 'party celebrate congrats',
  '❤️': 'love heart red',
  '🧵': 'thread sew spool',
  '🪡': 'needle sew patch stitch',
  '🧶': 'yarn knit wool',
  '👗': 'dress gown',
  '👚': 'blouse top shirt',
  '👕': 'shirt tee tshirt',
  '👖': 'jeans trousers pants',
  '🧥': 'coat jacket',
  '👘': 'kimono robe',
  '👔': 'tie shirt formal',
  '🥻': 'sari traditional',
  '👠': 'heels shoe',
  '👟': 'sneaker trainer shoe',
  '👜': 'bag handbag purse',
  '🛍️': 'bag shopping buy bag it',
  '📦': 'parcel package box delivery',
  '🚚': 'delivery truck shipping',
  '📏': 'measure ruler size length',
  '📐': 'measure angle size',
  '✂️': 'cut scissors tailor custom',
  '🏷️': 'tag price label',
  '💰': 'money cash price',
  '💳': 'card pay payment',
  '🧾': 'receipt invoice bill',
  '⏰': 'time clock when deadline',
  '🗓️': 'date calendar schedule',
  '📸': 'photo camera picture',
  '✅': 'done yes check confirm',
  '❌': 'no wrong cancel',
  '👑': 'crown queen king best',
  '💎': 'gem diamond premium',
};

/** Case-insensitive prefix/substring match over the keyword table. */
export function searchEmojis(query: string): string[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return [];
  return ALL_EMOJIS.filter((emoji) => {
    const keywords = EMOJI_KEYWORDS[emoji];
    return Boolean(keywords && keywords.includes(normalized));
  });
}

/** How many recents to keep. One row on a phone; more turns the shelf into a second grid. */
export const MAX_RECENT_EMOJIS = 16;

export const RECENT_EMOJIS_STORAGE_KEY = 'wiez.composer.recentEmojis.v1';
