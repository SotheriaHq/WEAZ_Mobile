import { useEffect, useState } from 'react';
import { passkeyAvailability, type PasskeyAvailability } from './passkeys';

export function usePasskeySupport(configuration?: { webConfigured: boolean; androidConfigured: boolean }) {
  const webConfigured = configuration?.webConfigured, androidConfigured = configuration?.androidConfigured;
  const [state, setState] = useState<PasskeyAvailability & { checking: boolean }>({ available: false, message: null, checking: true });
  useEffect(() => {
    let cancelled = false;
    if (webConfigured === undefined || androidConfigured === undefined) return;
    setState({ available: false, message: null, checking: true });
    passkeyAvailability({ webConfigured, androidConfigured }).then(result => { if (!cancelled) setState({ ...result, checking: false }); });
    return () => { cancelled = true; };
  }, [webConfigured, androidConfigured]);
  return state;
}
