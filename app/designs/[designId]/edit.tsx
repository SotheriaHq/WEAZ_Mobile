import { Redirect, useLocalSearchParams } from 'expo-router';

export default function DesignEditAliasRoute() {
  const params = useLocalSearchParams<{
    designId?: string | string[];
    recoveryTaskId?: string | string[];
  }>();
  const designId = Array.isArray(params.designId) ? params.designId[0] : params.designId;
  const recoveryTaskId = Array.isArray(params.recoveryTaskId)
    ? params.recoveryTaskId[0]
    : params.recoveryTaskId;

  return (
    <Redirect
      href={{
        pathname: '/catalog/create-design',
        params: designId ? { designId, recoveryTaskId } : undefined,
      } as any}
    />
  );
}
