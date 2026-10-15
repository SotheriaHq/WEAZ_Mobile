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

const GROUPED_RESET_PASSWORD_ROUTE = '/(auth)/reset-password';
const GROUPED_VERIFY_EMAIL_ROUTE = '/(auth)/verify-email';

/**
 * `/verify-email`, `/verify-email/<token>`, and the grouped route forms.
 * The token lives in the path because an Android intent URL drops `?token=`
 * on the way into the app. The query form is still accepted.
 */
const AUTH_ROUTE_PATTERN =
  /^\/(?:\(auth\)\/)?(verify-email|reset-password)(?:\/([^/?#]+))?$/;

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
    const match = getRoutePath(parsed).match(AUTH_ROUTE_PATTERN);
    if (!match) return null;

    const pathToken = match[2] ? decodeURIComponent(match[2]) : '';
    const token = getQueryValue(parsed.searchParams, 'token') || pathToken;
    const pathname =
      match[1] === 'reset-password'
        ? GROUPED_RESET_PASSWORD_ROUTE
        : GROUPED_VERIFY_EMAIL_ROUTE;

    return {
      pathname,
      ...(token ? { params: { token } } : null),
    };
  } catch {
    return null;
  }
}
