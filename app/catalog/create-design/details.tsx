import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';

import { AppLoaderScreen } from '@/components/ui/AppLoader';
import { AppText } from '@/components/ui/AppText';
import { Input } from '@/components/ui/Input';
import { DesignEditorShell } from '@/src/features/design-editor/DesignEditorShell';
import { useDesignEditor } from '@/src/features/design-editor/DesignEditorProvider';
import { useTheme } from '@/src/theme/ThemeProvider';
import { tokens } from '@/src/styles/tokens';

const VISIBILITY_OPTIONS = [
  { value: 'PUBLIC', label: '🌍 Public' },
  { value: 'PRIVATE', label: '🔒 Private' },
] as const;

const AUDIENCE_OPTIONS = [
  { value: 'EVERYBODY', label: 'Everybody' },
  { value: 'FEMALE', label: 'Women' },
  { value: 'MALE', label: 'Men' },
] as const;

const SIZING_OPTIONS = [
  { value: 'RTW_PLUS_FITTINGS', label: 'RTW + fittings' },
  { value: 'RTW', label: 'RTW only' },
  { value: 'CUSTOM', label: 'Custom only' },
  { value: 'NONE', label: 'No sizing info' },
] as const;

export default function CreateDesignDetailsScreen() {
  const {
    booting,
    categories,
    selectedCategory,
    subCategories,
    filterDimensions,
    filterSelection,
    form,
    updateField,
    toggleFilterValue,
    measurementPoints,
    customMeasurementKeys,
    toggleMeasurementKey,
  } = useDesignEditor();
  const { theme, scheme } = useTheme();
  const isDark = scheme === 'dark';

  const showMeasurementKeys =
    form.sizingMode === 'CUSTOM' || form.sizingMode === 'RTW_PLUS_FITTINGS' || form.customOrderEnabled;

  if (booting) {
    return <AppLoaderScreen message="Loading details step" />;
  }

  return (
    <DesignEditorShell
      step="details"
      title="Metadata and configuration"
      subtitle="Set the title, story, indicative price, visibility, category, and discovery filters."
      backHref="/catalog/create-design/media"
      nextLabel="Preview"
      onNext={() => router.replace('/catalog/create-design/review' as any)}
    >
      <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
        <Input
          label="Title"
          value={form.title}
          onChangeText={(value) => updateField('title', value)}
          placeholder="Name the design"
          containerStyle={styles.field}
        />

        <Input
          label="Description"
          value={form.description}
          onChangeText={(value) => updateField('description', value)}
          placeholder="Describe the inspiration, mood, or styling notes"
          multiline
          containerStyle={styles.field}
        />

        <Input
          label="Tags"
          value={form.tagsInput}
          onChangeText={(value) => updateField('tagsInput', value)}
          placeholder="comma, separated, tags"
          containerStyle={styles.field}
        />
      </View>
      <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}> 
        <AppText variant="smallBold" style={{ color: theme.colors.textMuted }}>
          Indicative price range
        </AppText>
        <View style={styles.priceRow}>
          <Input
            label="Min"
            value={form.minPrice}
            onChangeText={(value) => updateField('minPrice', value.replace(/[^0-9.]/g, ''))}
            placeholder="Min"
            keyboardType="decimal-pad"
            containerStyle={styles.priceField}
          />
          <Input
            label="Max"
            value={form.maxPrice}
            onChangeText={(value) => updateField('maxPrice', value.replace(/[^0-9.]/g, ''))}
            placeholder="Max"
            keyboardType="decimal-pad"
            containerStyle={styles.priceField}
          />
        </View>

        <AppText variant="smallBold" style={{ color: theme.colors.textMuted }}>
          Visibility
        </AppText>
        <View style={styles.optionRow}>
          {VISIBILITY_OPTIONS.map((option) => {
            const selected = form.visibility === option.value;
            return (
              <Pressable
                key={option.value}
                onPress={() => updateField('visibility', option.value)}
                style={[
                  styles.choiceChip,
                  {
                    borderColor: selected ? theme.colors.primary : theme.colors.border,
                    backgroundColor: selected ? `${theme.colors.primary}18` : 'transparent',
                  },
                ]}
              >
                <AppText variant="smallBold" style={{ color: selected ? theme.colors.primary : theme.colors.text }}>
                  {option.label}
                </AppText>
              </Pressable>
            );
          })}
        </View>

        <AppText variant="smallBold" style={{ color: theme.colors.textMuted }}>
          Audience
        </AppText>
        <View style={styles.optionRow}>
          {AUDIENCE_OPTIONS.map((option) => {
            const selected = form.audience === option.value;
            return (
              <Pressable
                key={option.value}
                onPress={() => updateField('audience', option.value)}
                style={[
                  styles.choiceChip,
                  {
                    borderColor: selected ? theme.colors.primary : theme.colors.border,
                    backgroundColor: selected ? `${theme.colors.primary}18` : 'transparent',
                  },
                ]}
              >
                <AppText variant="smallBold" style={{ color: selected ? theme.colors.primary : theme.colors.text }}>
                  {option.label}
                </AppText>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
        <AppText variant="smallBold" style={{ color: theme.colors.textMuted }}>
          Sizing mode
        </AppText>
        <View style={styles.optionRow}>
          {SIZING_OPTIONS.map((option) => {
            const selected = form.sizingMode === option.value;
            return (
              <Pressable
                key={option.value}
                onPress={() => updateField('sizingMode', option.value)}
                style={[
                  styles.choiceChip,
                  {
                    borderColor: selected ? theme.colors.primary : theme.colors.border,
                    backgroundColor: selected ? `${theme.colors.primary}18` : 'transparent',
                  },
                ]}
              >
                <AppText variant="smallBold" style={{ color: selected ? theme.colors.primary : theme.colors.text }}>
                  {option.label}
                </AppText>
              </Pressable>
            );
          })}
        </View>

        <Pressable
          onPress={() => updateField('customOrderEnabled', !form.customOrderEnabled)}
          style={[
            styles.choiceChip,
            {
              borderColor: form.customOrderEnabled ? theme.colors.primary : theme.colors.border,
              backgroundColor: form.customOrderEnabled ? `${theme.colors.primary}18` : 'transparent',
            },
          ]}
        >
          <AppText
            variant="smallBold"
            style={{ color: form.customOrderEnabled ? theme.colors.primary : theme.colors.text }}
          >
            ✂️ Enable custom orders
          </AppText>
        </Pressable>
      </View>

      {showMeasurementKeys ? (
        <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
          <AppText variant="smallBold" style={{ color: theme.colors.textMuted }}>
            Required measurement points
          </AppText>
          <View style={styles.optionRow}>
            {measurementPoints.map((point) => {
              const selected = customMeasurementKeys.includes(point.key);
              return (
                <Pressable
                  key={point.id}
                  onPress={() => toggleMeasurementKey(point.key)}
                  style={[
                    styles.choiceChip,
                    {
                      borderColor: selected ? theme.colors.primary : theme.colors.border,
                      backgroundColor: selected ? `${theme.colors.primary}18` : 'transparent',
                    },
                  ]}
                >
                  <AppText variant="smallBold" style={{ color: selected ? theme.colors.primary : theme.colors.text }}>
                    {point.label}
                  </AppText>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
        <AppText variant="smallBold" style={{ color: theme.colors.textMuted }}>
          Category
        </AppText>
        <View style={styles.optionRow}>
          {categories.map((category) => {
            const selected = form.categoryId === category.id;
            return (
              <Pressable
                key={category.id}
                onPress={() => updateField('categoryId', category.id)}
                style={[
                  styles.choiceChip,
                  {
                    borderColor: selected ? theme.colors.primary : theme.colors.border,
                    backgroundColor: selected ? `${theme.colors.primary}18` : 'transparent',
                  },
                ]}
              >
                <AppText variant="smallBold" style={{ color: selected ? theme.colors.primary : theme.colors.text }}>
                  {category.name}
                </AppText>
              </Pressable>
            );
          })}
        </View>

        <AppText variant="smallBold" style={{ color: theme.colors.textMuted }}>
          Sub-category
        </AppText>
        <View style={styles.optionRow}>
          {(selectedCategory ? subCategories : []).map((category) => {
            const selected = form.subCategoryId === category.id;
            return (
              <Pressable
                key={category.id}
                onPress={() => updateField('subCategoryId', category.id)}
                style={[
                  styles.choiceChip,
                  {
                    borderColor: selected ? theme.colors.primary : theme.colors.border,
                    backgroundColor: selected ? `${theme.colors.primary}18` : 'transparent',
                  },
                ]}
              >
                <AppText variant="smallBold" style={{ color: selected ? theme.colors.primary : theme.colors.text }}>
                  {category.name}
                </AppText>
              </Pressable>
            );
          })}
        </View>
      </View>

      {filterDimensions.map((dimension) => (
        <View
          key={dimension.id}
          style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
        >
          <AppText variant="smallBold" style={{ color: theme.colors.textMuted }}>
            {dimension.name}
          </AppText>
          <View style={styles.optionRow}>
            {dimension.values.map((value) => {
              const selected = (filterSelection[dimension.id] ?? []).includes(value.id);
              return (
                <Pressable
                  key={value.id}
                  onPress={() => toggleFilterValue(dimension.id, value.id, dimension.isMulti)}
                  style={[
                    styles.choiceChip,
                    {
                      borderColor: selected ? theme.colors.primary : theme.colors.border,
                      backgroundColor: selected ? `${theme.colors.primary}18` : 'transparent',
                    },
                  ]}
                >
                  <AppText variant="smallBold" style={{ color: selected ? theme.colors.primary : theme.colors.text }}>
                    {value.name}
                  </AppText>
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}
    </DesignEditorShell>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: tokens.radius.xl,
    padding: tokens.spacing.lg,
    gap: tokens.spacing.sm,
  },
  field: {
    marginTop: tokens.spacing.xs,
  },
  priceField: {
    flex: 1,
  },
  optionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.sm,
  },
  priceRow: {
    flexDirection: 'row',
    gap: tokens.spacing.md,
  },
  choiceChip: {
    borderWidth: 1,
    borderRadius: tokens.radius.lg,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.sm,
  },
});
