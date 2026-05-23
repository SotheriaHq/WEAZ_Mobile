type DiagnosticPrefix =
  | 'feed'
  | 'feed-contract'
  | 'feed-media'
  | 'feed-load'
  | 'layout'
  | 'media'
  | 'scroll'
  | 'prefetch'
  | 'api-host'
  | 'brand-avatar'
  | 'profile-menu-avatar'
  | 'profile'
  | 'catalog'
  | 'nav';

type DebugScope = 'feed' | 'media' | 'scroll' | 'network' | 'nav' | 'boot' | 'auth' | 'analytics';

const DEBUG_SCOPE_BY_PREFIX: Record<DiagnosticPrefix, DebugScope> = {
  feed: 'feed',
  'feed-contract': 'feed',
  'feed-media': 'media',
  'feed-load': 'feed',
  layout: 'nav',
  media: 'media',
  scroll: 'scroll',
  prefetch: 'media',
  'api-host': 'network',
  'brand-avatar': 'media',
  'profile-menu-avatar': 'media',
  profile: 'feed',
  catalog: 'feed',
  nav: 'nav',
};

const isTruthyFlag = (value?: string | null) => {
  const normalized = String(value ?? '').trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
};

const isScopeDebugFlagEnabled = (scope: DebugScope) => {
  switch (scope) {
    case 'feed':
      return isTruthyFlag(process.env.EXPO_PUBLIC_DEBUG_FEED);
    case 'media':
      return isTruthyFlag(process.env.EXPO_PUBLIC_DEBUG_MEDIA);
    case 'scroll':
      return isTruthyFlag(process.env.EXPO_PUBLIC_DEBUG_SCROLL);
    case 'network':
      return isTruthyFlag(process.env.EXPO_PUBLIC_DEBUG_NETWORK);
    case 'nav':
      return isTruthyFlag(process.env.EXPO_PUBLIC_DEBUG_NAV);
    case 'boot':
      return isTruthyFlag(process.env.EXPO_PUBLIC_DEBUG_BOOT);
    case 'auth':
      return isTruthyFlag(process.env.EXPO_PUBLIC_DEBUG_AUTH);
    case 'analytics':
      return isTruthyFlag(process.env.EXPO_PUBLIC_DEBUG_ANALYTICS);
  }
};

export const isThreadlyDebugEnabled = (scope: DebugScope) => {
  if (!__DEV__) return false;
  return (
    isTruthyFlag(process.env.EXPO_PUBLIC_DEBUG_THREADLY) ||
    isScopeDebugFlagEnabled(scope)
  );
};

const writeDevDiagnostic = (
  level: 'log' | 'warn',
  prefix: DiagnosticPrefix,
  event: string,
  details?: Record<string, unknown>,
) => {
  if (!isThreadlyDebugEnabled(DEBUG_SCOPE_BY_PREFIX[prefix])) return;
  const payload = { event, ...(details ?? {}) };
  if (level === 'warn') {
    console.warn(`[${prefix}]`, payload);
    return;
  }
  console.log(`[${prefix}]`, payload);
};

export const feedDevLog = (event: string, details?: Record<string, unknown>) =>
  writeDevDiagnostic('log', 'feed', event, details);

export const feedContractDevLog = (event: string, details?: Record<string, unknown>) =>
  writeDevDiagnostic('log', 'feed-contract', event, details);

export const feedMediaDevLog = (event: string, details?: Record<string, unknown>) =>
  writeDevDiagnostic('log', 'feed-media', event, details);

export const feedLoadDevLog = (event: string, details?: Record<string, unknown>) =>
  writeDevDiagnostic('log', 'feed-load', event, details);

export const layoutDevLog = (event: string, details?: Record<string, unknown>) =>
  writeDevDiagnostic('log', 'layout', event, details);

export const feedDevWarn = (event: string, details?: Record<string, unknown>) =>
  writeDevDiagnostic('warn', 'feed', event, details);

export const mediaDevLog = (event: string, details?: Record<string, unknown>) =>
  writeDevDiagnostic('log', 'media', event, details);

export const mediaDevWarn = (event: string, details?: Record<string, unknown>) =>
  writeDevDiagnostic('warn', 'media', event, details);

export const scrollDevLog = (event: string, details?: Record<string, unknown>) =>
  writeDevDiagnostic('log', 'scroll', event, details);

export const prefetchDevLog = (event: string, details?: Record<string, unknown>) =>
  writeDevDiagnostic('log', 'prefetch', event, details);

export const apiHostDevLog = (event: string, details?: Record<string, unknown>) =>
  writeDevDiagnostic('log', 'api-host', event, details);

export const apiHostDevWarn = (event: string, details?: Record<string, unknown>) =>
  writeDevDiagnostic('warn', 'api-host', event, details);

export const brandAvatarDevLog = (event: string, details?: Record<string, unknown>) =>
  writeDevDiagnostic('log', 'brand-avatar', event, details);

export const profileMenuAvatarDevLog = (event: string, details?: Record<string, unknown>) =>
  writeDevDiagnostic('log', 'profile-menu-avatar', event, details);

export const profileDevWarn = (event: string, details?: Record<string, unknown>) =>
  writeDevDiagnostic('warn', 'profile', event, details);

export const catalogDevLog = (event: string, details?: Record<string, unknown>) =>
  writeDevDiagnostic('log', 'catalog', event, details);

export const navDevLog = (event: string, details?: Record<string, unknown>) =>
  writeDevDiagnostic('log', 'nav', event, details);
