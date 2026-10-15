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
 *
 * There is no `view/[collectionId]` screen. Viewing a design or a store
 * collection leaves the catalogue for the shared content viewers
 * (`/market-viewer`, `/collection-viewer`), which are top-level routes.
 * Declaring a view screen here made expo-router warn about a route with no
 * matching file.
 */

import { Stack } from 'expo-router';

export default function CatalogLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="[brandId]" />
      <Stack.Screen name="create-design" />
      <Stack.Screen name="create-collection" />
    </Stack>
  );
}
