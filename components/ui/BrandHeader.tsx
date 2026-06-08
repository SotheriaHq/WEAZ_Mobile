import React from 'react';
import { Pressable } from 'react-native';
import { router } from 'expo-router';

import { Header } from '@/components/ui/Header';
import { ThreadlyLogo } from '@/components/ui/ThreadlyLogo';
import { PRODUCT_NAME } from '@/src/config/productIdentity';

export function BrandHeader({ right }: { right?: React.ReactNode }) {
  return (
    <Header
      title={PRODUCT_NAME}
      left={
        <Pressable
          onPress={() => router.push('/')}
          style={({ pressed }) => [pressed && { opacity: 0.75 }]}
          accessibilityRole="button"
          accessibilityLabel="Go to home"
        >
          <ThreadlyLogo size={32} />
        </Pressable>
      }
      right={right}
    />
  );
}
