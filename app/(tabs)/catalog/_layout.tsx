/**
 * Catalog Layout - Mobile
 * Stack layout for catalog-related screens
 */

import { Stack, usePathname } from 'expo-router';

import CatalogIslandBottomNav from '@/components/navigation/CatalogIslandBottomNav';

export default function CatalogLayout() {
  const pathname = usePathname();
  const firstCatalogSegment = pathname.split('/')[2] ?? '';
  const isFocusedCatalogFlow =
    firstCatalogSegment === 'view' ||
    firstCatalogSegment === 'create-design' ||
    firstCatalogSegment === 'create-collection' ||
    firstCatalogSegment === 'edit-profile';
  const showIsland =
    pathname === '/catalog' ||
    (Boolean(firstCatalogSegment) &&
      !isFocusedCatalogFlow &&
      /^\/catalog\/[^/]+\/?$/.test(pathname));

  return (
    <>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="[brandId]" />
        <Stack.Screen name="view/[collectionId]" />
        <Stack.Screen name="create-design" />
        <Stack.Screen name="create-collection" />
      </Stack>
      {/* Full-screen viewer/editor routes intentionally hide bottom nav to avoid covering primary media and form controls. */}
      {showIsland ? <CatalogIslandBottomNav /> : null}
    </>
  );
}
