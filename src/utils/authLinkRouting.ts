export type MobileAuthRoute =
  | {
      pathname: '/(auth)/reset-password';
      params?: {
        token?: string;
      };
    }
  | {
      pathname: '/(auth)/verify-email';
      params?: {
        token?: string;
      };
    };

const RESET_PASSWORD_ROUTE = '/reset-password';
const GROUPED_RESET_PASSWORD_ROUTE = '/(auth)/reset-password';
const VERIFY_EMAIL_ROUTE = '/verify-email';
const GROUPED_VERIFY_EMAIL_ROUTE = '/(auth)/verify-email';

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

    if (routePath === RESET_PASSWORD_ROUTE || routePath === GROUPED_RESET_PASSWORD_ROUTE) {
      const token = getQueryValue(parsed.searchParams, 'token');

      return {
        pathname: GROUPED_RESET_PASSWORD_ROUTE,
        ...(token ? { params: { token } } : null),
      };
    }

    if (routePath === VERIFY_EMAIL_ROUTE || routePath === GROUPED_VERIFY_EMAIL_ROUTE) {
      const token = getQueryValue(parsed.searchParams, 'token');

      return {
        pathname: GROUPED_VERIFY_EMAIL_ROUTE,
        ...(token ? { params: { token } } : null),
      };
    }

    return null;
  } catch {
    return null;
  }
}
