/**
 * Catalog Layout - Mobile
 * Stack layout for catalog-related screens
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
