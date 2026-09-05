import React from 'react';
import { Pressable } from 'react-native';
import { topLevelNavigate } from '@/src/utils/mobileNavigation';

import { Header } from '@/components/ui/Header';
import WiezOrb from '@/src/brand/WiezOrb';
import { PRODUCT_NAME } from '@/src/brand/identity';

export function BrandHeader({ right }: { right?: React.ReactNode }) {
  return (
    <Header
      title={PRODUCT_NAME}
      left={
        <Pressable
          onPress={() => topLevelNavigate('/')}
          style={({ pressed }) => [pressed && { opacity: 0.75 }]}
          accessibilityRole="button"
          accessibilityLabel="Go to home"
        >
          <WiezOrb size={32} />
        </Pressable>
      }
      right={right}
    />
  );
}
