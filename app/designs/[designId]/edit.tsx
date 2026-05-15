import { Redirect, useLocalSearchParams } from 'expo-router';

export default function DesignEditAliasRoute() {
  const params = useLocalSearchParams<{ designId?: string | string[] }>();
  const designId = Array.isArray(params.designId) ? params.designId[0] : params.designId;

  return (
    <Redirect
      href={{
        pathname: '/catalog/create-design',
        params: designId ? { designId } : undefined,
      } as any}
    />
  );
}
