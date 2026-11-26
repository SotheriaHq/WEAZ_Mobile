import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppBottomSheet } from '@/components/ui/AppBottomSheet';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { FilterChip } from '@/components/ui/FilterChip';
import { Input } from '@/components/ui/Input';
import { MuseLoader } from '@/components/ui/MuseLoader';
import { tokens } from '@/src/styles/tokens';

import {
  MARKET_V2_AUDIENCE_LABELS,
  MARKET_V2_FULFILMENT_LABELS,
  marketV2FilterLimitReason,
  marketV2SortLabel,
  normalizeMarketV2Filters,
  parseMarketV2PriceInput,
  priceRangeError,
  toggleMarketV2DimensionValue,
  toggleMarketV2ListValue,
  type MarketV2Audience,
  type MarketV2ErrorInfo,
  type MarketV2FacetOption,
  type MarketV2Facets,
  type MarketV2Filters,
  type MarketV2Fulfilment,
  type MarketV2ListFilterKey,
  type MarketV2Sort,
} from '../marketV2Contract';
import { formatMarketV2Price } from '../marketV2Runtime';

type Props = {
  visible: boolean;
  filters: MarketV2Filters;
  sort: MarketV2Sort | null;
  sortMenu: MarketV2Sort[];
  /** The list's own order when no sort is chosen ('source' for curated lists). */
  defaultSort: string | null;
  facets: MarketV2Facets | null;
  facetsLoading: boolean;
  facetsError: MarketV2ErrorInfo | null;
  onRetryFacets?: () => void;
  /** Filters this surface fixes (a category page keeps its category). */
  fixed?: Partial<Record<MarketV2ListFilterKey, true>>;
  onClose: () => void;
  onApply: (filters: MarketV2Filters, sort: MarketV2Sort | null) => void;
};

const AUDIENCES: MarketV2Audience[] = ['MEN', 'WOMEN', 'UNISEX'];
const FULFILMENTS: MarketV2Fulfilment[] = ['READY_TO_WEAR', 'MADE_TO_ORDER'];
const formatPrice = (amount: number) => formatMarketV2Price(amount);
const priceText = (value: number | undefined) => (value === undefined ? '' : String(value));

function Section({ title, note, children }: { title: string; note?: string | null; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <AppText variant="subtitle" accessibilityRole="header">
        {title}
      </AppText>
      {note ? (
        <AppText variant="caption" tone="muted">
          {note}
        </AppText>
      ) : null}
      <View style={styles.wrap}>{children}</View>
    </View>
  );
}

const truncationNote = (facets: MarketV2Facets | null, key: string) => {
  const entry = facets?.truncation[key];
  return entry ? `Showing the top ${entry.returned} of ${entry.available}. Search finds the rest.` : null;
};

/**
 * Sort and filter for a Market list. Changes are a draft until Apply, so no
 * request runs while the shopper is still choosing; Reset returns the draft
 * to what is applied. Values with no pieces stay visible, disabled, so the
 * sheet never rearranges itself under a finger.
 */
export function MarketV2FilterSheet({
  visible,
  filters,
  sort,
  sortMenu,
  defaultSort,
  facets,
  facetsLoading,
  facetsError,
  onRetryFacets,
  fixed,
  onClose,
  onApply,
}: Props) {
  const [draft, setDraft] = useState(filters);
  const [draftSort, setDraftSort] = useState(sort);
  const [minText, setMinText] = useState(priceText(filters.price?.min));
  const [maxText, setMaxText] = useState(priceText(filters.price?.max));
  const [limitNote, setLimitNote] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setDraft(filters);
    setDraftSort(sort);
    setMinText(priceText(filters.price?.min));
    setMaxText(priceText(filters.price?.max));
    setLimitNote(null);
  }, [filters, sort, visible]);

  const min = parseMarketV2PriceInput(minText);
  const max = parseMarketV2PriceInput(maxText);
  const priceError =
    min === null || max === null
      ? 'Enter a price in naira, for example 25000.'
      : priceRangeError(min, max);

  const toggle = (field: MarketV2ListFilterKey, value: string) => {
    const selected = ((draft[field] as string[] | undefined) ?? []).includes(value);
    const reason = selected ? null : marketV2FilterLimitReason(draft, field);
    setLimitNote(reason);
    if (!reason) setDraft((current) => toggleMarketV2ListValue(current, field, value));
  };

  const options = (field: MarketV2ListFilterKey, list: MarketV2FacetOption[]) =>
    list.map((option) => {
      const selected = ((draft[field] as string[] | undefined) ?? []).includes(option.value);
      return (
        <FilterChip
          key={option.value}
          label={option.label}
          count={option.count}
          selected={selected}
          disabled={option.disabled && !selected}
          onPress={() => toggle(field, option.value)}
        />
      );
    });

  const types = useMemo(() => {
    const chosen = draft.categoryIds ?? [];
    const all = facets?.categoryTypes ?? [];
    return chosen.length ? all.filter((option) => !option.categoryId || chosen.includes(option.categoryId)) : all;
  }, [draft.categoryIds, facets?.categoryTypes]);

  const sortOptions: Array<{ key: MarketV2Sort | null; label: string }> = [
    ...(defaultSort && (sortMenu as string[]).includes(defaultSort)
      ? []
      : [{ key: null, label: defaultSort === 'source' || !defaultSort ? 'Featured order' : marketV2SortLabel(defaultSort) }]),
    ...sortMenu.map((key) => ({ key, label: marketV2SortLabel(key) })),
  ];
  const currentSort = draftSort ?? (defaultSort && (sortMenu as string[]).includes(defaultSort) ? defaultSort : null);

  const apply = () => {
    if (priceError) return;
    onApply(
      normalizeMarketV2Filters({
        ...draft,
        price: { min: min ?? undefined, max: max ?? undefined },
      }),
      draftSort,
    );
  };

  return (
    <AppBottomSheet
      visible={visible}
      title="Sort and filter"
      onClose={onClose}
      showCloseButton
      footer={
        <View style={styles.footer}>
          <Button
            title="Reset"
            variant="secondary"
            size="md"
            onPress={() => {
              setDraft(filters);
              setDraftSort(sort);
              setMinText(priceText(filters.price?.min));
              setMaxText(priceText(filters.price?.max));
              setLimitNote(null);
            }}
            style={styles.footerButton}
          />
          <Button title="Show pieces" size="md" disabled={Boolean(priceError)} onPress={apply} style={styles.footerButton} />
        </View>
      }
    >
      {limitNote ? (
        <AppText variant="smallBold" tone="warning" accessibilityLiveRegion="polite">
          {limitNote}
        </AppText>
      ) : null}

      {sortOptions.length > 1 ? (
        <Section title="Sort">
          {sortOptions.map((option) => (
            <FilterChip
              key={option.key ?? 'default'}
              label={option.label}
              selected={option.key === null ? currentSort === null : currentSort === option.key}
              onPress={() => setDraftSort(option.key)}
            />
          ))}
        </Section>
      ) : null}

      {facetsLoading && !facets ? (
        <View style={styles.state}>
          <MuseLoader size={20} />
          <AppText variant="small" tone="muted">
            Loading filters
          </AppText>
        </View>
      ) : null}
      {facetsError && !facets ? (
        <View style={styles.state}>
          <AppText variant="small" tone="muted">
            {facetsError.message}
          </AppText>
          {onRetryFacets ? <Button title="Try again" variant="secondary" size="sm" onPress={onRetryFacets} /> : null}
        </View>
      ) : null}

      {fixed?.audience ? null : (
        <Section title="Shop for">
          {AUDIENCES.map((audience) => {
            const facet = facets?.audience.find((option) => option.value === audience);
            const selected = (draft.audience ?? []).includes(audience);
            return (
              <FilterChip
                key={audience}
                label={MARKET_V2_AUDIENCE_LABELS[audience]}
                count={facet?.count ?? null}
                selected={selected}
                disabled={Boolean(facet?.disabled) && !selected}
                onPress={() => toggle('audience', audience)}
              />
            );
          })}
        </Section>
      )}

      <Section title="How it is made">
        {FULFILMENTS.map((fulfilment) => {
          const facet = facets?.fulfilment.find((option) => option.value === fulfilment);
          const selected = draft.fulfilment === fulfilment;
          return (
            <FilterChip
              key={fulfilment}
              label={MARKET_V2_FULFILMENT_LABELS[fulfilment]}
              count={facet?.count ?? null}
              selected={selected}
              disabled={Boolean(facet?.disabled) && !selected}
              onPress={() =>
                setDraft((current) => normalizeMarketV2Filters({ ...current, fulfilment: selected ? undefined : fulfilment }))
              }
            />
          );
        })}
        <FilterChip
          label="On sale"
          selected={Boolean(draft.onSale)}
          onPress={() => setDraft((current) => normalizeMarketV2Filters({ ...current, onSale: !current.onSale }))}
        />
        <FilterChip
          label="In stock"
          selected={Boolean(draft.inStockOnly)}
          onPress={() => setDraft((current) => normalizeMarketV2Filters({ ...current, inStockOnly: !current.inStockOnly }))}
        />
      </Section>

      {facets?.categories.length && !fixed?.categoryIds ? (
        <Section title="Category" note={truncationNote(facets, 'category')}>
          {options('categoryIds', facets.categories)}
        </Section>
      ) : null}
      {types.length ? (
        <Section title="Garment type" note={truncationNote(facets, 'type')}>
          {options('categoryTypeIds', types)}
        </Section>
      ) : null}
      {facets?.brands.length && !fixed?.brandIds ? (
        <Section title="Designer" note={truncationNote(facets, 'brand')}>
          {options('brandIds', facets.brands)}
        </Section>
      ) : null}
      {facets?.colors.length ? (
        <Section title="Colour" note={truncationNote(facets, 'color')}>
          {options('colors', facets.colors)}
        </Section>
      ) : null}
      {facets?.sizes.length ? (
        <Section
          title="Size"
          note={facets.customFitAnySize ? 'Made-to-measure pieces are cut to any size.' : truncationNote(facets, 'size')}
        >
          {options('sizes', facets.sizes)}
        </Section>
      ) : null}
      {facets?.tags.length ? (
        <Section title="Style tags" note={truncationNote(facets, 'tag')}>
          {options('tags', facets.tags)}
        </Section>
      ) : null}
      {facets?.dimensions.map((dimension) => (
        <Section key={dimension.key} title={dimension.name} note={dimension.isMulti ? null : 'Choose one.'}>
          {dimension.values.map((option) => {
            const selected = (draft.dimensions?.[dimension.key] ?? []).includes(option.value);
            return (
              <FilterChip
                key={option.value}
                label={option.label}
                count={option.count}
                selected={selected}
                disabled={option.disabled && !selected}
                onPress={() => {
                  const reason = selected || !dimension.isMulti ? null : marketV2FilterLimitReason(draft, `dim.${dimension.key}`);
                  setLimitNote(reason);
                  if (!reason) {
                    setDraft((current) => toggleMarketV2DimensionValue(current, dimension.key, option.value, dimension.isMulti));
                  }
                }}
              />
            );
          })}
        </Section>
      ))}

      <View style={styles.section}>
        <AppText variant="subtitle" accessibilityRole="header">
          Price
        </AppText>
        {facets?.price?.bands.length ? (
          <View style={styles.wrap}>
            {facets.price.bands.map((band) => {
              const selected = min === band.min && max === band.max;
              return (
                <FilterChip
                  key={`${band.min}-${band.max}`}
                  label={`${formatPrice(band.min)} to ${formatPrice(band.max)}`}
                  count={band.count}
                  selected={selected}
                  onPress={() => {
                    setMinText(selected ? '' : String(band.min));
                    setMaxText(selected ? '' : String(band.max));
                  }}
                />
              );
            })}
          </View>
        ) : null}
        <View style={styles.priceRow}>
          <Input
            label="Minimum price"
            hideLabel
            keyboardType="numeric"
            value={minText}
            onChangeText={setMinText}
            placeholder={facets?.price ? `From ${formatPrice(facets.price.min)}` : 'Min'}
            containerStyle={styles.priceInput}
          />
          <Input
            label="Maximum price"
            hideLabel
            keyboardType="numeric"
            value={maxText}
            onChangeText={setMaxText}
            placeholder={facets?.price ? `Up to ${formatPrice(facets.price.max)}` : 'Max'}
            containerStyle={styles.priceInput}
          />
        </View>
        {priceError ? (
          <AppText variant="smallBold" tone="danger">
            {priceError}
          </AppText>
        ) : null}
      </View>
    </AppBottomSheet>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: tokens.spacing.sm,
  },
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: tokens.spacing.sm,
  },
  state: {
    minHeight: 72,
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacing.sm,
  },
  priceRow: {
    flexDirection: 'row',
    gap: tokens.spacing.sm,
  },
  priceInput: {
    flex: 1,
  },
  footer: {
    flexDirection: 'row',
    gap: tokens.spacing.sm,
  },
  footerButton: {
    flex: 1,
  },
});
