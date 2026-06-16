import React from 'react';
import { Stack, useLocalSearchParams } from 'expo-router';

import { DesignEditorProvider } from '@/src/features/design-editor/DesignEditorProvider';

export default function CreateDesignFlowLayout() {
  const params = useLocalSearchParams<{ designId?: string; handoffToken?: string }>();
  const designId = typeof params.designId === 'string' && params.designId.length > 0 ? params.designId : undefined;
  const handoffToken = typeof params.handoffToken === 'string' && params.handoffToken.length > 0 ? params.handoffToken : undefined;

  return (
    <DesignEditorProvider designId={designId} assetHandoffToken={handoffToken}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="composer" />
        <Stack.Screen name="preview" />
      </Stack>
    </DesignEditorProvider>
  );
}
