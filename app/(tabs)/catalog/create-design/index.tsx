import React from 'react';
import { Redirect, useLocalSearchParams } from 'expo-router';

export default function CreateDesignEntryRedirect() {
  const params = useLocalSearchParams<Record<string, string | string[]>>();

  return (
    <Redirect
      href={{
        pathname: '/catalog/create-design/composer',
        params,
      }}
    />
  );
}
