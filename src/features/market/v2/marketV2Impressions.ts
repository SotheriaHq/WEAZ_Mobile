/**
 * Impressions for the server-composed Market.
 *
 * A card is impressed when at least half of it has been on screen for 500 ms,
 * once per card per section per epoch. On a phone a card sits in a sideways
 * rail inside the vertical page, so two lists each report what they show (both
 * with the same 50 % / 500 ms viewability rule) and a card counts only while
 * its row AND its own slot in the rail are visible.
 *
 * `visibleMs` is what was actually measured: the time since the later of the
 * two became visible, plus the 500 ms each list waited before reporting it.
 */
export const MARKET_V2_IMPRESSION_MIN_MS = 500;
const SEEN_LIMIT = 2000;

export type MarketV2ImpressionCard = {
  key: string;
  position: number;
};

export type MarketV2Impression = {
  rowKey: string;
  card: MarketV2ImpressionCard;
  visibleMs: number;
};

export class MarketV2ImpressionTracker {
  private readonly rows = new Map<string, number>();
  private readonly cards = new Map<string, Map<string, { since: number; card: MarketV2ImpressionCard }>>();
  private readonly seen = new Set<string>();
  private epoch: string | null = null;

  constructor(
    private readonly onImpression: (impression: MarketV2Impression) => void,
    private readonly now: () => number,
  ) {}

  /** A new epoch is a new served Market: every card may be impressed again. */
  setEpoch(epoch: string | null) {
    if (epoch === this.epoch) return;
    this.epoch = epoch;
    this.seen.clear();
  }

  /** Vertical list: a row became (or stopped being) viewable. */
  setRowVisible(rowKey: string, visible: boolean) {
    if (!visible) {
      this.rows.delete(rowKey);
      return;
    }
    if (!this.rows.has(rowKey)) this.rows.set(rowKey, this.now());
    this.emit(rowKey);
  }

  /** Sideways rail, or the cards of a grid row: what is viewable inside the row. */
  setRowCards(rowKey: string, cards: ReadonlyArray<MarketV2ImpressionCard>) {
    const previous = this.cards.get(rowKey) ?? new Map();
    const next = new Map<string, { since: number; card: MarketV2ImpressionCard }>();
    const at = this.now();
    for (const card of cards) next.set(card.key, previous.get(card.key) ?? { since: at, card });
    if (next.size) this.cards.set(rowKey, next);
    else this.cards.delete(rowKey);
    this.emit(rowKey);
  }

  /** Forget rows that left the list (a refresh replaced them). */
  forgetRows() {
    this.rows.clear();
    this.cards.clear();
  }

  private emit(rowKey: string) {
    const rowSince = this.rows.get(rowKey);
    const cards = this.cards.get(rowKey);
    if (rowSince === undefined || !cards) return;
    const at = this.now();
    for (const { since, card } of cards.values()) {
      const id = `${rowKey}:${card.key}`;
      if (this.seen.has(id)) continue;
      if (this.seen.size >= SEEN_LIMIT) this.seen.clear();
      this.seen.add(id);
      this.onImpression({
        rowKey,
        card,
        visibleMs: Math.max(0, Math.round(at - Math.max(rowSince, since))) + MARKET_V2_IMPRESSION_MIN_MS,
      });
    }
  }
}
