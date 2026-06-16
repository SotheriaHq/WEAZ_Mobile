/**
 * Catalog Layout - Mobile
 * Stack layout for catalog-related screens.
 *
 * Catalogue now lives INSIDE the `(tabs)` group (registered as a hidden
 * `Tabs.Screen` in `app/(tabs)/_layout.tsx`), so the single canonical floating
 * island nav is rendered once by the tab shell and overlays every tab — this one
 * included. This layout therefore renders no island of its own; doing so would
 * stack a second bottom nav bar. The tab shell hides that island for the focused
 * catalogue sub-flows (create-design, view, create-collection, edit-profile) to
 * preserve the previous full-screen, island-free behaviour.
 */

import { Stack } from 'expo-router';

export default function CatalogLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="[brandId]" />
      <Stack.Screen name="view/[collectionId]" />
      <Stack.Screen name="create-design" />
      <Stack.Screen name="create-collection" />
    </Stack>
  );
}
