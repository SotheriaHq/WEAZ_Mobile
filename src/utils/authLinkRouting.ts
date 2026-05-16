export type MobileAuthRoute =
  | {
      pathname: '/(auth)/reset-password';
      params?: {
        token?: string;
      };
    };

const RESET_PASSWORD_ROUTE = '/reset-password';
const GROUPED_RESET_PASSWORD_ROUTE = '/(auth)/reset-password';

const normalizePath = (value: string): string => {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return '/';
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
};

const getQueryValue = (searchParams: URLSearchParams, key: string): string => {
  return searchParams.get(key)?.trim() ?? '';
};

const getRoutePath = (parsed: URL): string => {
  const isWebLink = parsed.protocol === 'http:' || parsed.protocol === 'https:';
  if (!isWebLink && parsed.hostname) {
    return normalizePath(
      `${parsed.hostname}${parsed.pathname === '/' ? '' : parsed.pathname}`,
    );
  }

  return normalizePath(parsed.pathname);
};

export function resolveMobileAuthRoute(url: string | null | undefined): MobileAuthRoute | null {
  if (!url) return null;

  try {
    const parsed = new URL(url);
    const routePath = getRoutePath(parsed);

    if (routePath !== RESET_PASSWORD_ROUTE && routePath !== GROUPED_RESET_PASSWORD_ROUTE) {
      return null;
    }

    const token = getQueryValue(parsed.searchParams, 'token');

    return {
      pathname: GROUPED_RESET_PASSWORD_ROUTE,
      ...(token ? { params: { token } } : null),
    };
  } catch {
    return null;
  }
}
