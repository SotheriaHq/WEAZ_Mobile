import React from 'react';
import { Stack, useLocalSearchParams } from 'expo-router';

import { DesignEditorProvider } from '@/src/features/design-editor/DesignEditorProvider';

export default function CreateDesignFlowLayout() {
  const params = useLocalSearchParams<{ designId?: string }>();
  const designId = typeof params.designId === 'string' && params.designId.length > 0 ? params.designId : undefined;

  return (
    <DesignEditorProvider designId={designId}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="composer" />
        <Stack.Screen name="preview" />
      </Stack>
    </DesignEditorProvider>
  );
}
