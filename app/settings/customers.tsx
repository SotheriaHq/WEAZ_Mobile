import React, { useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";
import { Header } from "@/components/ui/Header";
import { AppBackButton } from "@/components/ui/AppBackButton";
import { AppText } from "@/components/ui/AppText";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useBrandCommerceAccess } from "@/src/hooks/useBrandCommerceAccess";
import { BrandCustomersApi } from "@/src/api/BrandCustomersApi";
import { useTheme } from "@/src/theme/ThemeProvider";
import { tokens } from "@/src/styles/tokens";
import { useToast } from "@/src/toast/ToastContext";
import { drillDownPush } from "@/src/utils/mobileNavigation";

export default function CustomerSettings() {
  const access = useBrandCommerceAccess();
  const client = useQueryClient();
  const { theme } = useTheme();
  const toast = useToast();
  const scope = `${access.actorId}:${access.brandId}`;
  const currentScope = useRef({ key: scope, epoch: 0, mounted: true });
  if (currentScope.current.key !== scope) {
    currentScope.current = { key: scope, epoch: currentScope.current.epoch + 1, mounted: true };
  }
  const [draft, setDraft] = useState<{ scope: string; value: string } | null>(null);
  const minimum = draft?.scope === scope ? draft.value : String(access.data?.customerMinimumOrders ?? 3);
  const [pendingSave, setPendingSave] = useState<{ scope: string; token: symbol } | null>(null);
  const saving = pendingSave?.scope === scope;
  useEffect(() => {
    currentScope.current.mounted = true;
    setDraft(null);
    return () => {
      currentScope.current.mounted = false;
      currentScope.current.epoch++;
    };
  }, [scope]);
  const enabled = access.data?.canConfigureCustomers === true;
  const valid =
    /^\d+$/.test(minimum) && Number(minimum) >= 1 && Number(minimum) <= 1000;
  const save = async () => {
    if (!access.canManage || !access.brandId || !enabled || !valid || saving) return;
    const epoch = currentScope.current.epoch;
    const token = Symbol("customer-settings-save");
    const isCurrent = () => currentScope.current.mounted &&
      currentScope.current.key === scope && currentScope.current.epoch === epoch;
    setPendingSave({ scope, token });
    try {
      const saved = await BrandCustomersApi.update(access.brandId, Number(minimum));
      if (!isCurrent()) return;
      client.setQueryData(["brand-commerce-access", access.actorId, access.brandId], saved);
      setDraft(null);
      await Promise.all([
        client.invalidateQueries({ queryKey: ["brand-commerce-access", access.actorId, access.brandId] }),
        client.invalidateQueries({ queryKey: ["brand-customers", access.actorId, access.brandId] }),
      ]);
      if (isCurrent()) toast.success("Customer settings saved");
    } catch {
      if (isCurrent()) toast.error("Could not save customer settings. Try again.");
    } finally {
      setPendingSave((pending) => pending?.token === token ? null : pending);
    }
  };
  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={[styles.root, { backgroundColor: theme.colors.bg }]}
    >
      <Header title="Customer settings" wrapText left={<AppBackButton />} />
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <AppText variant="body">
          Choose how many paid orders a shopper needs to appear in Customers.
          Standard and custom orders count together. Cancelled and fully
          refunded orders are excluded.
        </AppText>
        {!access.canManage ? (
          <AppText variant="body" tone="muted">
            Only the brand owner can change customer settings.
          </AppText>
        ) : null}
        {access.isLoading ? (
          <AppText variant="body" tone="muted">
            Loading settings…
          </AppText>
        ) : null}
        {access.isError ? (
          <Button
            title="Try loading settings again"
            variant="secondary"
            onPress={() => access.refetch()}
          />
        ) : null}
        {access.data ? (
          <>
            {!enabled ? (
              <View style={styles.group}>
                <AppText variant="body" tone="muted">
                  Free brands see every shopper with a qualifying paid order.
                  Upgrade to set a purchase threshold.
                </AppText>
              {access.data.canUpgrade ? <Button
                  title="Upgrade"
                  onPress={() =>
                    drillDownPush("/settings/subscriptions" as never)
                  }
              /> : null}
              </View>
            ) : null}
            <AppText variant="bodyBold">
              Minimum paid orders{!enabled ? " · Upgrade" : ""}
            </AppText>
            <Input
              label="Minimum paid orders"
              hideLabel
              value={minimum}
              onChangeText={(value) => setDraft({ scope, value })}
              keyboardType="number-pad"
              editable={enabled && !saving}
              accessibilityLabel="Minimum paid orders"
            />
            <AppText variant="body" tone="muted">
              Use a whole number from 1 to 1,000. The default is 3. Your saved
              threshold is kept after a downgrade.
            </AppText>
            <Button
              title="Save customer settings"
              disabled={!enabled || !valid}
              loading={saving}
              onPress={save}
            />
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: tokens.spacing.lg, gap: tokens.spacing.lg },
  group: { gap: tokens.spacing.md },
});
