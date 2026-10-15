import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { LocationCascadeFields } from '@/components/forms/LocationCascadeFields';
import { PhoneNumberField } from '@/components/forms/PhoneNumberField';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { ProfileApi, type SavedDeliveryAddress } from '@/src/api/ProfileApi';
import {
  displayNameOf,
  draftFromAddress,
  emptyAddressDraft,
  formatAddressLine,
  removeAddress,
  sortNewestFirst,
  toSavedAddress,
  upsertAddress,
  validateAddressDraft,
  type DeliveryAddressDraft,
} from '@/src/features/delivery/deliveryAddressBook';
import {
  getDeliveryAddressSnapshot,
  rememberDeliveryAddresses,
  subscribeDeliveryAddressCache,
  warmDeliveryAddressCache,
  type ProfileAddressSeed,
} from '@/src/features/delivery/deliveryAddressCache';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';

/**
 * The saved-address book, as web has it: pick one, edit it, add another.
 *
 * Web's checkout and custom-order composer both show saved addresses as cards
 * with the most recent selected, keep the form folded until something needs
 * typing, and offer "Update address" and "Add new address". The app had none of
 * it — checkout silently copied the first saved address into a nine-field form,
 * and the custom sheet showed one address with no way to choose another.
 *
 * One component for every place that needs a delivery address, so they cannot
 * drift apart again. It owns loading, choosing, adding, editing and removing,
 * and saves the whole book to the server (the book is one list per account,
 * shared with web). The parent only learns which address is chosen.
 */

export type DeliveryAddressDefaults = {
  customerName?: string;
  contactEmail?: string;
  phone?: string;
  street?: string;
  city?: string;
  state?: string;
  country?: string;
};

type FormState = { mode: 'add' | 'edit'; draft: DeliveryAddressDraft } | null;

export type DeliveryAddressBookProps = {
  selectedId: string | null;
  /** The chosen address, or null when the book is empty. */
  onSelect: (address: SavedDeliveryAddress | null) => void;
  /**
   * Prefill for a brand-new address — the signed-in account's name, email and
   * phone. A shopper should never retype details their account already has.
   */
  defaults?: DeliveryAddressDefaults;
  /** True while the add/edit form is open, so a parent can hold its own action. */
  onEditingChange?: (editing: boolean) => void;
  title?: string;
  subtitle?: string;
};

export function DeliveryAddressBook({
  selectedId,
  onSelect,
  defaults,
  onEditingChange,
  title = 'Delivery address',
  subtitle,
}: DeliveryAddressBookProps) {
  const { theme } = useTheme();
  const snapshot = useSyncExternalStore(
    subscribeDeliveryAddressCache,
    getDeliveryAddressSnapshot,
    getDeliveryAddressSnapshot,
  );
  const book = snapshot.book ?? [];
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showErrors, setShowErrors] = useState(false);

  const seedDraft = useCallback(
    (profile: ProfileAddressSeed | null) =>
      emptyAddressDraft({
        ...defaults,
        street: defaults?.street || profile?.street || '',
        city: defaults?.city || profile?.city || '',
        state: defaults?.state || profile?.state || '',
        country: defaults?.country || profile?.country || '',
      }),
    [defaults],
  );

  const [form, setForm] = useState<FormState>(() => {
    const initial = getDeliveryAddressSnapshot();
    if (initial.book && initial.book.length > 0) return null;
    return { mode: 'add', draft: emptyAddressDraft(defaults) };
  });

  // Read inside effects without making them re-run when the parent re-renders.
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const defaultsRef = useRef(defaults);
  defaultsRef.current = defaults;
  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;
  const formRef = useRef(form);
  formRef.current = form;
  const touchedRef = useRef(false);
  /** "Add another" stays open when a background refresh republishes the book. */
  const heldOpenRef = useRef(false);
  const announcedIdRef = useRef<string | null | undefined>(undefined);

  const openAdd = useCallback(() => {
    heldOpenRef.current = true;
    touchedRef.current = false;
    setShowErrors(false);
    setError(null);
    setForm({
      mode: 'add',
      draft: emptyAddressDraft({
        ...defaultsRef.current,
        street: defaultsRef.current?.street || snapshot.profile?.street || '',
        city: defaultsRef.current?.city || snapshot.profile?.city || '',
        state: defaultsRef.current?.state || snapshot.profile?.state || '',
        country: defaultsRef.current?.country || snapshot.profile?.country || '',
      }),
    });
  }, [snapshot.profile]);

  useEffect(() => {
    void warmDeliveryAddressCache();
  }, []);

  useEffect(() => {
    const loaded = snapshot.book;
    const draft = seedDraft(snapshot.profile);
    const current = formRef.current;
    const keepWhatTheyTyped =
      touchedRef.current || heldOpenRef.current || current?.mode === 'edit';

    if (loaded == null || loaded.length === 0) {
      if (!keepWhatTheyTyped) {
        const currentDraft = formRef.current?.mode === 'add' ? formRef.current.draft : null;
        const sameSeed =
          currentDraft != null &&
          currentDraft.customerName === draft.customerName &&
          currentDraft.contactEmail === draft.contactEmail &&
          currentDraft.phone === draft.phone &&
          currentDraft.street === draft.street &&
          currentDraft.city === draft.city &&
          currentDraft.state === draft.state &&
          currentDraft.country === draft.country;
        if (!sameSeed) setForm({ mode: 'add', draft });
      }
      if (loaded && announcedIdRef.current !== null) {
        announcedIdRef.current = null;
        onSelectRef.current(null);
      }
      return;
    }

    if (!keepWhatTheyTyped) setForm(null);
    const chosen =
      loaded.find((entry) => entry.id === selectedIdRef.current) ?? loaded[0];
    if (announcedIdRef.current !== chosen.id) {
      announcedIdRef.current = chosen.id;
      onSelectRef.current(chosen);
    }
  }, [seedDraft, snapshot]);

  useEffect(() => {
    onEditingChange?.(form !== null);
  }, [form, onEditingChange]);

  const updateDraft = (patch: Partial<DeliveryAddressDraft>) => {
    touchedRef.current = true;
    setForm((current) => (current ? { ...current, draft: { ...current.draft, ...patch } } : current));
  };

  const persist = async (next: SavedDeliveryAddress[]) => {
    const kept = sortNewestFirst(await ProfileApi.replaceDeliveryAddresses(next));
    rememberDeliveryAddresses(kept);
    return kept;
  };

  const handleSave = async () => {
    if (!form) return;
    const errors = validateAddressDraft(form.draft);
    if (Object.keys(errors).length > 0) {
      setShowErrors(true);
      setError('Complete the highlighted details to save this address.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const saved = toSavedAddress(form.draft);
      const kept = await persist(upsertAddress(book, saved));
      heldOpenRef.current = false;
      touchedRef.current = false;
      announcedIdRef.current = saved.id;
      onSelect(kept.find((entry) => entry.id === saved.id) ?? kept[0] ?? null);
      setForm(null);
      setShowErrors(false);
    } catch {
      setError('This address could not be saved. Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = (address: SavedDeliveryAddress) => {
    Alert.alert('Remove this address?', formatAddressLine(address), [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            setSaving(true);
            setError(null);
            try {
              const kept = await persist(removeAddress(book, address.id));
              if (address.id === selectedId) onSelect(kept[0] ?? null);
              if (kept.length === 0) openAdd();
            } catch {
              setError('This address could not be removed. Try again.');
            } finally {
              setSaving(false);
            }
          })();
        },
      },
    ]);
  };

  const fieldErrors = showErrors && form ? validateAddressDraft(form.draft) : {};
  const locationError = fieldErrors.street || fieldErrors.country || fieldErrors.state || fieldErrors.city;

  return (
    <View style={styles.root}>
      <View style={styles.head}>
        <AppText variant="subtitle">{title}</AppText>
        {subtitle ? (
          <AppText variant="caption" tone="muted">
            {subtitle}
          </AppText>
        ) : null}
      </View>

      <>
          {/* ── Saved addresses ─────────────────────────────────────── */}
          {book.map((address) => {
            const selected = address.id === selectedId;
            const editingThis = form?.mode === 'edit' && form.draft.id === address.id;
            if (editingThis) return null;
            return (
              <Pressable
                key={address.id}
                onPress={() => onSelect(address)}
                disabled={saving || form !== null}
                accessibilityRole="radio"
                accessibilityState={{ selected, disabled: saving || form !== null }}
                accessibilityLabel={`${displayNameOf(address)}, ${formatAddressLine(address)}`}
              >
                <Card
                  padding="md"
                  style={[
                    styles.card,
                    {
                      borderColor: selected ? theme.colors.primary : theme.colors.border,
                      backgroundColor: selected ? theme.colors.primarySoft : theme.colors.surface,
                    },
                  ]}
                >
                  <View style={styles.cardTop}>
                    <AppText
                      variant="bodyBold"
                      tone={selected ? 'primary' : 'default'}
                      style={styles.cardName}
                    >
                      {displayNameOf(address)}
                    </AppText>
                    {selected ? (
                      <AppText variant="bodyBold" tone="primary" accessibilityLabel="Selected">
                        ✓
                      </AppText>
                    ) : null}
                  </View>
                  <AppText variant="caption" tone="secondary">
                    {formatAddressLine(address)}
                  </AppText>
                  <AppText variant="caption" tone="muted">
                    {[address.phone, address.contactEmail].filter(Boolean).join(' · ')}
                  </AppText>
                  {form === null ? (
                    <View style={styles.cardActions}>
                      <Button
                        title="Edit"
                        size="sm"
                        variant="secondary"
                        disabled={saving}
                        onPress={() => {
                          setShowErrors(false);
                          setError(null);
                          setForm({ mode: 'edit', draft: draftFromAddress(address) });
                        }}
                      />
                      <Button
                        title="Remove"
                        size="sm"
                        variant="ghost"
                        disabled={saving}
                        onPress={() => handleRemove(address)}
                      />
                    </View>
                  ) : null}
                </Card>
              </Pressable>
            );
          })}

          {/* ── Add / edit ──────────────────────────────────────────── */}
          {form ? (
            <Card padding="md" style={styles.formCard}>
              <AppText variant="bodyBold">
                {form.mode === 'edit' ? 'Edit address' : book.length > 0 ? 'Add another address' : 'Delivery address'}
              </AppText>
              <Input
                label="Full name"
                value={form.draft.customerName}
                onChangeText={(value) => updateDraft({ customerName: value })}
                placeholder="Who receives the delivery"
                autoCapitalize="words"
                error={fieldErrors.customerName}
              />
              <Input
                label="Email"
                value={form.draft.contactEmail}
                onChangeText={(value) => updateDraft({ contactEmail: value })}
                keyboardType="email-address"
                autoCapitalize="none"
                placeholder="name@example.com"
                error={fieldErrors.contactEmail}
              />
              <PhoneNumberField
                label="Phone number"
                value={form.draft.phone}
                onChange={(value) => updateDraft({ phone: value })}
                required
                error={fieldErrors.phone}
              />
              <LocationCascadeFields
                value={{
                  country: form.draft.country,
                  state: form.draft.state,
                  city: form.draft.city,
                  address: form.draft.street,
                }}
                onChange={(patch) => {
                  const { address: street, ...location } = patch;
                  updateDraft({ ...location, ...(street !== undefined ? { street } : {}) });
                }}
              />
              {locationError ? (
                <AppText variant="caption" tone="danger">
                  {locationError}
                </AppText>
              ) : null}
              <Input
                label="Apartment / suite (optional)"
                value={form.draft.apartment}
                onChangeText={(value) => updateDraft({ apartment: value })}
                placeholder="Apt, floor, landmark"
              />
              <Input
                label="Postal code (optional)"
                value={form.draft.postalCode}
                onChangeText={(value) => updateDraft({ postalCode: value })}
                placeholder="100001"
              />
              <View style={styles.formActions}>
                {book.length > 0 ? (
                  <Button
                    title="Cancel"
                    size="sm"
                    variant="secondary"
                    disabled={saving}
                    onPress={() => {
                      heldOpenRef.current = false;
                      touchedRef.current = false;
                      setForm(null);
                      setShowErrors(false);
                      setError(null);
                    }}
                  />
                ) : null}
                <Button
                  title={form.mode === 'edit' ? 'Save changes' : 'Save address'}
                  size="sm"
                  loading={saving}
                  disabled={saving}
                  onPress={() => void handleSave()}
                />
              </View>
            </Card>
          ) : book.length > 0 && book.length < 10 ? (
            <Button
              title="➕ Add another address"
              size="sm"
              variant="secondary"
              disabled={saving}
              onPress={openAdd}
            />
          ) : null}

          {error ? (
            <AppText variant="caption" tone="danger">
              {error}
            </AppText>
          ) : null}
      </>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: tokens.spacing.md,
  },
  head: {
    gap: tokens.spacing.xs,
  },
  card: {
    gap: tokens.spacing.xs,
    borderWidth: 1,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
  },
  cardName: {
    flex: 1,
    minWidth: 0,
  },
  cardActions: {
    flexDirection: 'row',
    gap: tokens.spacing.sm,
    marginTop: tokens.spacing.xs,
  },
  formCard: {
    gap: tokens.spacing.md,
  },
  formActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: tokens.spacing.sm,
  },
});

export default DeliveryAddressBook;
