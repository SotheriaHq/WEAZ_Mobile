import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { AppBottomSheet } from '@/components/ui/AppBottomSheet';
import { useAuth } from '@/src/auth/AuthContext';
import { getActiveBrandMembership } from '@/src/auth/brandAccess';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';

const roleLabel = (role: string) => role.replace(/_/g, ' ').toLowerCase();

export function BrandSwitcherSheet() {
  const { theme } = useTheme();
  const { user, setActiveBrandId } = useAuth();
  const [open, setOpen] = useState(false);
  const activeMemberships = useMemo(
    () => (user?.brandMemberships ?? []).filter((membership) => membership.status === 'ACTIVE'),
    [user?.brandMemberships],
  );
  const selected = getActiveBrandMembership(user) ?? activeMemberships[0] ?? null;

  if (activeMemberships.length <= 1 || !selected) {
    return null;
  }

  const handleSelect = async (brandId: string) => {
    await setActiveBrandId(brandId);
    setOpen(false);
  };

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Switch brand workspace"
        onPress={() => setOpen(true)}
        style={({ pressed }) => [
          styles.trigger,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
            opacity: pressed ? 0.82 : 1,
          },
        ]}
      >
        <View style={styles.triggerCopy}>
          <AppText variant="caption" tone="muted">
            Active brand
          </AppText>
          <AppText variant="bodyBold" numberOfLines={1}>
            {selected.brandName || 'Brand workspace'}
          </AppText>
        </View>
        <AppText variant="captionBold" tone="primary">
          Switch
        </AppText>
      </Pressable>

      <AppBottomSheet
        visible={open}
        title="Brand workspace"
        onClose={() => setOpen(false)}
        scrollable={false}
      >
        {activeMemberships.map((membership) => {
          const isSelected = membership.brandId === selected.brandId;
          return (
            <Pressable
              key={membership.brandId}
              accessibilityRole="button"
              onPress={() => void handleSelect(membership.brandId)}
              style={({ pressed }) => [
                styles.row,
                {
                  backgroundColor: isSelected ? theme.colors.primarySoft : theme.colors.surfaceAlt,
                  borderColor: isSelected ? theme.colors.primary : theme.colors.border,
                  opacity: pressed ? 0.82 : 1,
                },
              ]}
            >
              <View style={styles.rowCopy}>
                <AppText variant="bodyBold" numberOfLines={1}>
                  {membership.brandName || 'Brand workspace'}
                </AppText>
                <AppText variant="caption" tone="secondary">
                  {roleLabel(membership.role)}
                </AppText>
              </View>
              {isSelected ? (
                <AppText variant="captionBold" tone="primary">
                  Active
                </AppText>
              ) : null}
            </Pressable>
          );
        })}
      </AppBottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    minHeight: 58,
    borderWidth: 1,
    borderRadius: tokens.radius.lg,
    paddingHorizontal: tokens.spacing.lg,
    paddingVertical: tokens.spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacing.md,
  },
  triggerCopy: {
    minWidth: 0,
    flex: 1,
  },
  row: {
    minHeight: 64,
    borderWidth: 1,
    borderRadius: tokens.radius.lg,
    paddingHorizontal: tokens.spacing.lg,
    paddingVertical: tokens.spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacing.md,
  },
  rowCopy: {
    minWidth: 0,
    flex: 1,
  },
});
