type DiagnosticPrefix = 'feed' | 'feed-contract' | 'media' | 'scroll' | 'prefetch' | 'api-host';

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
