/**
 * Notification copy, as SEGMENTS rather than one flat sentence.
 *
 * `describeNotification` used to return a string, so "nuelscotour commented on
 * your design" rendered in one uniform weight and colour. Every notification in
 * the list then looked like the same grey paragraph, and the two things a
 * person actually scans for — WHO did it and WHAT they did it to — carried no
 * more emphasis than "on your". A notification list is read by skimming; if
 * nothing is emphasised, it has to be read word by word instead.
 *
 * Returning segments keeps the sentence in one place (the copy and the emphasis
 * are decided together, not by a renderer guessing at substrings) while letting
 * the row set the actor and the content title apart. Matching substrings in the
 * view would break the moment a brand is called "your design".
 */

export type NotificationSegmentKind =
  /** Ordinary sentence text. */
  | 'plain'
  /** The person or brand who acted — the primary thing being scanned for. */
  | 'actor'
  /** The design, product, order or collection acted upon. */
  | 'content'
  /** The user's own words quoted back (a comment excerpt). */
  | 'quote';

export type NotificationSegment = {
  text: string;
  kind: NotificationSegmentKind;
};

const plain = (text: string): NotificationSegment => ({ text, kind: 'plain' });
const actor = (text: string): NotificationSegment => ({ text, kind: 'actor' });
const content = (text: string): NotificationSegment => ({ text, kind: 'content' });
const quote = (text: string): NotificationSegment => ({ text, kind: 'quote' });

export type NotificationCopySource = {
  type: string;
  message?: string | null;
  actorName: string;
  /** Title of the design/product/collection, when the payload carries one. */
  contentTitle?: string | null;
  /** Comment excerpt, when the payload carries one. */
  excerpt?: string | null;
};

/**
 * The object of the sentence.
 *
 * Falls back to "your design" when the payload has no title — which is what the
 * copy said before, and is still true, just less specific. A title is always
 * preferable: "commented on Adire Wrap Dress" tells someone which of forty
 * pieces without opening anything.
 */
const target = (contentTitle: string | null | undefined, fallback: string): NotificationSegment =>
  contentTitle && contentTitle.trim() ? content(contentTitle.trim()) : plain(fallback);

export function describeNotificationSegments(
  source: NotificationCopySource,
): NotificationSegment[] {
  const type = source.type.toUpperCase();
  const name = source.actorName;
  const excerpt = source.excerpt?.trim() ? source.excerpt.trim() : null;

  if (type.includes('FOLLOW')) {
    return [actor(name), plain(' patched you.')];
  }

  if (type.includes('COMMENT')) {
    const segments: NotificationSegment[] = [
      actor(name),
      plain(' commented on '),
      target(source.contentTitle, 'your design'),
    ];
    if (excerpt) {
      segments.push(plain(': '), quote(`“${excerpt}”`));
    } else {
      segments.push(plain('.'));
    }
    return segments;
  }

  if (type.includes('THREAD')) {
    return [
      actor(name),
      plain(' threaded '),
      target(source.contentTitle, 'your design'),
      plain('.'),
    ];
  }

  if (type.includes('TAG_MENTION')) {
    return [actor(name), plain(' mentioned you in new activity.')];
  }

  /*
    Server-authored messages stay whole.

    Order and custom-order notifications carry a sentence written by the backend
    with amounts, statuses and reference numbers in it. Splitting that on the
    client would mean re-deriving its grammar from the outside; the actor is
    still emphasised when the message is absent and we compose our own.
  */
  if (source.message && source.message.trim()) {
    return [plain(source.message.trim())];
  }

  if (type.includes('PATCH')) {
    return [actor(name), plain(' updated a patch request.')];
  }
  if (type.startsWith('ORDER_')) {
    return [plain('Your order has new activity.')];
  }
  if (type.startsWith('CUSTOM_ORDER_')) {
    return [plain('Your custom order has new activity.')];
  }
  if (type.includes('MESSAGE')) {
    return [actor(name), plain(' sent you a message.')];
  }
  if (type.includes('SIZE_FIT')) {
    return [actor(name), plain(' updated size-fit activity.')];
  }

  return [actor(name), plain(' sent you a notification.')];
}

/** Flat text, for accessibility labels and anywhere a single string is needed. */
export function describeNotificationText(source: NotificationCopySource): string {
  return describeNotificationSegments(source)
    .map((segment) => segment.text)
    .join('');
}
