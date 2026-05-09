type DiagnosticPrefix = 'feed' | 'feed-contract' | 'feed-media' | 'media' | 'scroll' | 'prefetch' | 'api-host' | 'brand-avatar' | 'profile' | 'nav';

const writeDevDiagnostic = (
  level: 'log' | 'warn',
  prefix: DiagnosticPrefix,
  event: string,
  details?: Record<string, unknown>,
) => {
  if (!__DEV__) return;
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

export const profileDevWarn = (event: string, details?: Record<string, unknown>) =>
  writeDevDiagnostic('warn', 'profile', event, details);

export const navDevLog = (event: string, details?: Record<string, unknown>) =>
  writeDevDiagnostic('log', 'nav', event, details);
