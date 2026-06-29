import React from 'react';
import { Stack, useLocalSearchParams } from 'expo-router';

import { DesignEditorProvider } from '@/src/features/design-editor/DesignEditorProvider';

export default function CreateDesignFlowLayout() {
  const params = useLocalSearchParams<{ designId?: string; handoffToken?: string; recoveryTaskId?: string }>();
  const designId = typeof params.designId === 'string' && params.designId.length > 0 ? params.designId : undefined;
  const handoffToken = typeof params.handoffToken === 'string' && params.handoffToken.length > 0 ? params.handoffToken : undefined;
  const recoveryTaskId = typeof params.recoveryTaskId === 'string' && params.recoveryTaskId.length > 0
    ? params.recoveryTaskId
    : undefined;

  return (
    <DesignEditorProvider
      designId={designId}
      assetHandoffToken={handoffToken}
      recoveryTaskId={recoveryTaskId}
    >
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="composer" />
        <Stack.Screen name="preview" />
      </Stack>
    </DesignEditorProvider>
  );
}
