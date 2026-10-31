type ComposerRouteParam = string | string[] | undefined;

export type ComposerEntryParams = {
  blank?: ComposerRouteParam;
  autoOpenPickerSource?: ComposerRouteParam;
};

const firstValue = (value: ComposerRouteParam) => (Array.isArray(value) ? value[0] : value);

/**
 * Whether the user chose to start a new design, so an empty composer is
 * expected and must stay open.
 */
export function isBlankComposerStart(params: ComposerEntryParams) {
  const blank = firstValue(params.blank);
  return blank === '1' || blank === 'true' || !!firstValue(params.autoOpenPickerSource);
}

/**
 * Applied as the auto-opened picker launches, so it opens exactly once.
 *
 * Both keys go in one update. Clearing `autoOpenPickerSource` alone erases the
 * only record that this is a new design: the empty composer then redirects to
 * the catalogue, and losing focus cancels the picker that was about to open.
 */
export const AUTO_OPEN_CONSUMED_PARAMS = {
  autoOpenPickerSource: undefined,
  blank: '1',
} as const;
