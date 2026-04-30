import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import {
  apiClient,
  setApiAuthToken,
  setApiRefreshToken,
  setUnauthorizedHandler,
} from '@/src/api/httpClient';
import {
  getAccessToken,
  getRefreshToken,
  removeAccessToken,
  removeRefreshToken,
  setAccessToken,
  setRefreshToken,
} from '@/src/storage/secureStorage';
import { resolveProfileImageSource } from '@/src/utils/profileImage';

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

export type AuthUser = {
  id: string;
  email?: string | null;
  type?: 'BRAND' | 'REGULAR' | string;
  firstName?: string | null;
  lastName?: string | null;
  username?: string | null;
  brandFullName?: string | null;
  brandDescription?: string | null;
  brandCountry?: string | null;
  brandState?: string | null;
  brandCity?: string | null;
  brandTags?: string[];
  brandBusinessType?: string | null;
  socialInstagram?: string | null;
  socialFacebook?: string | null;
  socialTwitter?: string | null;
  socialWebsite?: string | null;
  phoneNumber?: string | null;
  profileImage?: string | null;
  profileImageId?: string | null;
  profileImageFile?: {
    id?: string | null;
    s3Url?: string | null;
    url?: string | null;
  } | null;
  bannerImage?: string | null;
  bannerImageId?: string | null;
  bannerImageFile?: {
    id?: string | null;
    s3Url?: string | null;
    url?: string | null;
  } | null;
  verificationStatus?: string | null;
  isVerifiedBrand?: boolean | null;
  updatedAt?: string | null;
};

type SignInParams = {
  email: string;
  password: string;
};

type SignUpParams = {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  type?: 'BRAND' | 'REGULAR';
  brandFullName?: string;
};

type AuthContextValue = {
  status: AuthStatus;
  isAuthenticated: boolean;
  token: string | null;
  user: AuthUser | null;
  updateUser: (patch: Partial<AuthUser>) => void;
  validateToken: () => Promise<boolean>;
  signIn: (params: SignInParams) => Promise<void>;
  signUp: (params: SignUpParams) => Promise<void>;
  signOut: () => Promise<void>;
};

type AuthSessionContextValue = {
  status: AuthStatus;
  isAuthenticated: boolean;
  token: string | null;
  userId: string | null;
  userType: AuthUser['type'] | null;
  updateUser: (patch: Partial<AuthUser>) => void;
  validateToken: () => Promise<boolean>;
  signIn: (params: SignInParams) => Promise<void>;
  signUp: (params: SignUpParams) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);
const AuthSessionContext = createContext<AuthSessionContextValue | null>(null);

const INVISIBLE_AUTH_SPACING_REGEX =
  /[\u00A0\u1680\u180E\u2000-\u200D\u202F\u205F\u2060\u3000\uFEFF]/g;

const CONTROL_CHAR_REGEX = /[\u0000-\u001F\u007F]/;

function containsInvisibleSpacing(value: string): boolean {
  INVISIBLE_AUTH_SPACING_REGEX.lastIndex = 0;
  return INVISIBLE_AUTH_SPACING_REGEX.test(value);
}

function summarizeSecret(value: string) {
  return {
    length: value.length,
    leadingWhitespace: /^\s/.test(value),
    trailingWhitespace: /\s$/.test(value),
    hasInvisibleSpacing: containsInvisibleSpacing(value),
    hasControlChars: CONTROL_CHAR_REGEX.test(value),
  };
}

function maskSecret(value: string): string {
  if (!value) return '(empty)';
  return '*'.repeat(value.length);
}

function summarizeIdentifier(value: string) {
  return {
    length: value.length,
    hasAtSign: value.includes('@'),
    leadingWhitespace: /^\s/.test(value),
    trailingWhitespace: /\s$/.test(value),
    hasInvisibleSpacing: containsInvisibleSpacing(value),
    hasControlChars: CONTROL_CHAR_REGEX.test(value),
  };
}

function sanitizeLoginIdentifier(value: string): string {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(INVISIBLE_AUTH_SPACING_REGEX, '')
    .trim();
}

function sanitizeLoginPassword(value: string): string {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(INVISIBLE_AUTH_SPACING_REGEX, '');
}

function unwrapData<T>(payload: unknown): T {
  if (payload && typeof payload === 'object' && 'data' in (payload as any)) {
    return (payload as any).data as T;
  }
  return payload as T;
}

const normalizeAuthFile = (candidates: unknown[]) => {
  const candidate = candidates.find((value) => value && typeof value === 'object') as any;

  if (!candidate || typeof candidate !== 'object') {
    return null;
  }

  return {
    id: candidate.id ?? candidate.fileId ?? null,
    s3Url: candidate.s3Url ?? candidate.url ?? null,
    url: candidate.url ?? candidate.s3Url ?? null,
  };
};

const normalizeAuthImageFile = (raw: any) =>
  normalizeAuthFile([
    raw?.profileImageFile,
    raw?.user?.profileImageFile,
    raw?.logoImageMeta,
    raw?.user?.logoImageMeta,
    raw?.brandLogoFile,
    raw?.user?.brandLogoFile,
  ]);

const normalizeAuthBannerFile = (raw: any) =>
  normalizeAuthFile([
    raw?.bannerImageFile,
    raw?.user?.bannerImageFile,
    raw?.bannerImageMeta,
    raw?.user?.bannerImageMeta,
  ]);

function normalizeAuthUser(raw: unknown): AuthUser | null {
  if (!raw || typeof raw !== 'object') return null;

  const source = raw as any;
  const nestedUser = source.user && typeof source.user === 'object' ? source.user : null;
  const id = String(source.id ?? nestedUser?.id ?? '');
  if (!id) return null;

  const resolvedImage = resolveProfileImageSource({
    profileImage: source.profileImage ?? nestedUser?.profileImage ?? null,
    profileImageId: source.profileImageId ?? nestedUser?.profileImageId ?? null,
    profileImageFile: source.profileImageFile ?? nestedUser?.profileImageFile ?? null,
    logoImage: source.logoImage ?? nestedUser?.logoImage ?? null,
    logoImageId: source.logoImageId ?? nestedUser?.logoImageId ?? null,
    logoImageMeta: source.logoImageMeta ?? nestedUser?.logoImageMeta ?? null,
    brandLogo: source.brandLogo ?? nestedUser?.brandLogo ?? null,
    brandLogoId: source.brandLogoId ?? nestedUser?.brandLogoId ?? null,
    brandLogoFile: source.brandLogoFile ?? nestedUser?.brandLogoFile ?? null,
    avatarUrl: source.avatarUrl ?? nestedUser?.avatarUrl ?? null,
  });

  return {
    id,
    email: source.email ?? nestedUser?.email ?? null,
    type: source.type ?? nestedUser?.type ?? null,
    firstName: source.firstName ?? nestedUser?.firstName ?? null,
    lastName: source.lastName ?? nestedUser?.lastName ?? null,
    username: source.username ?? nestedUser?.username ?? null,
    brandFullName: source.brandFullName ?? nestedUser?.brandFullName ?? null,
    brandDescription:
      source.brandDescription ??
      source.description ??
      nestedUser?.brandDescription ??
      nestedUser?.description ??
      null,
    brandCountry: source.brandCountry ?? source.country ?? nestedUser?.brandCountry ?? nestedUser?.country ?? null,
    brandState: source.brandState ?? source.state ?? nestedUser?.brandState ?? nestedUser?.state ?? null,
    brandCity: source.brandCity ?? source.city ?? nestedUser?.brandCity ?? nestedUser?.city ?? null,
    brandTags:
      (Array.isArray(source.brandTags) ? source.brandTags : Array.isArray(source.tags) ? source.tags : Array.isArray(source.hashtags) ? source.hashtags : null) ??
      (Array.isArray(nestedUser?.brandTags)
        ? nestedUser.brandTags
        : Array.isArray(nestedUser?.tags)
          ? nestedUser.tags
          : Array.isArray(nestedUser?.hashtags)
            ? nestedUser.hashtags
            : null) ??
      [],
    brandBusinessType:
      source.brandBusinessType ??
      source.businessType ??
      nestedUser?.brandBusinessType ??
      nestedUser?.businessType ??
      null,
    socialInstagram: source.socialInstagram ?? nestedUser?.socialInstagram ?? source.socialLinks?.instagram ?? nestedUser?.socialLinks?.instagram ?? null,
    socialFacebook: source.socialFacebook ?? nestedUser?.socialFacebook ?? source.socialLinks?.facebook ?? nestedUser?.socialLinks?.facebook ?? null,
    socialTwitter: source.socialTwitter ?? nestedUser?.socialTwitter ?? source.socialLinks?.twitter ?? nestedUser?.socialLinks?.twitter ?? null,
    socialWebsite: source.socialWebsite ?? nestedUser?.socialWebsite ?? source.socialLinks?.website ?? nestedUser?.socialLinks?.website ?? null,
    phoneNumber: source.phoneNumber ?? nestedUser?.phoneNumber ?? null,
    profileImage: resolvedImage.src,
    profileImageId: resolvedImage.fileId,
    profileImageFile: normalizeAuthImageFile(source),
    bannerImage: source.bannerImage ?? nestedUser?.bannerImage ?? null,
    bannerImageId: source.bannerImageId ?? nestedUser?.bannerImageId ?? null,
    bannerImageFile: normalizeAuthBannerFile(source),
    verificationStatus: source.verificationStatus ?? nestedUser?.verificationStatus ?? null,
    isVerifiedBrand: source.isVerifiedBrand ?? nestedUser?.isVerifiedBrand ?? null,
    updatedAt: source.updatedAt ?? nestedUser?.updatedAt ?? null,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [token, setToken] = useState<string | null>(null);
  const [refreshTokenState, setRefreshTokenState] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);

  const bootstrappedRef = useRef(false);

  const signOut = useCallback(async (options?: { notifyServer?: boolean }) => {
    const notifyServer = options?.notifyServer ?? true;
    const refreshToken = refreshTokenState ?? (await getRefreshToken());

    if (notifyServer) {
      try {
        await apiClient.post('/auth/logout', {
          refreshToken: refreshToken ?? undefined,
        });
      } catch {
        // best-effort server logout only
      }
    }

    setApiAuthToken(null);
    setApiRefreshToken(null);
    setToken(null);
    setRefreshTokenState(null);
    setUser(null);
    setStatus('unauthenticated');
    await removeAccessToken();
    await removeRefreshToken();
  }, [refreshTokenState]);

  const updateUser = useCallback((patch: Partial<AuthUser>) => {
    setUser((current) => {
      if (!current) return current;

      const nextUser: AuthUser = { ...current };
      for (const [key, value] of Object.entries(patch)) {
        if (value !== undefined) {
          (nextUser as any)[key] = value;
        }
      }

      return normalizeAuthUser(nextUser) ?? nextUser;
    });
  }, []);

  const validateToken = useCallback(async (): Promise<boolean> => {
    const currentToken = token ?? (await getAccessToken());

    if (!currentToken) {
      await signOut();
      return false;
    }

    try {
      setApiAuthToken(currentToken);
      const response = await apiClient.get('/auth/profile');
      const profile = unwrapData<any>(response.data);

      const mappedUser = normalizeAuthUser(profile);

      if (!mappedUser?.id) throw new Error('Invalid profile response');

      setUser(mappedUser);
      setToken(currentToken);
      setStatus('authenticated');
      return true;
    } catch {
      await signOut();
      return false;
    }
  }, [signOut, token]);

  const signIn = useCallback(async ({ email, password }: SignInParams) => {
    const rawIdentifier = String(email ?? '');
    const rawPassword = String(password ?? '');
    const normalizedIdentifier = sanitizeLoginIdentifier(email);
    const sanitizedPassword = sanitizeLoginPassword(password);
    const looksLikeEmail = normalizedIdentifier.includes('@');

    if (__DEV__) {
      console.log('[auth] login submit diagnostics', {
        rawIdentifierMeta: summarizeIdentifier(rawIdentifier),
        normalizedIdentifierMeta: summarizeIdentifier(normalizedIdentifier),
        identifierChanged: rawIdentifier !== normalizedIdentifier,
        looksLikeEmail,
        rawPasswordMeta: summarizeSecret(rawPassword),
        sanitizedPasswordMeta: summarizeSecret(sanitizedPassword),
      });
    }

    if (!normalizedIdentifier || !sanitizedPassword) {
      throw new Error('Login failed: missing identifier or password');
    }

    const loginWithPayload = (
      candidatePayload: { email: string; password: string } | { identifier: string; password: string },
      label: string,
    ) => {
      if (__DEV__) {
        console.log('[auth] /auth/login payload', {
          attempt: label,
          payload: {
            field: 'email' in candidatePayload ? 'email' : 'identifier',
            identifierMeta: summarizeIdentifier(
              'email' in candidatePayload ? candidatePayload.email : candidatePayload.identifier,
            ),
            password: maskSecret(candidatePayload.password),
          },
          passwordMeta: summarizeSecret(candidatePayload.password),
        });
      }

      return apiClient.post('/auth/login', candidatePayload).catch((error) => {
        if (__DEV__) {
          console.log('[auth] login attempt failed', {
            attempt: label,
            status: error?.response?.status,
            data: error?.response?.data,
          });
        }
        throw error;
      });
    };

    const loginWithPassword = (candidatePassword: string, label: string) =>
      apiClient.post(
        '/auth/login',
        looksLikeEmail
          ? {
              email: normalizedIdentifier,
              password: candidatePassword,
            }
          : {
              identifier: normalizedIdentifier,
              password: candidatePassword,
            },
      ).catch((error) => {
        if (__DEV__) {
          console.log('[auth] login attempt failed', {
            attempt: label,
            status: error?.response?.status,
            data: error?.response?.data,
          });
        }
        throw error;
      });

    let response;
    try {
      try {
        response = await loginWithPassword(sanitizedPassword, 'primary');
      } catch (error: any) {
        const trimmedPassword = sanitizedPassword.trim();
        const canRetryWithTrimmedPassword =
          error?.response?.status === 401 && trimmedPassword !== sanitizedPassword;

        if (canRetryWithTrimmedPassword) {
          response = await loginWithPassword(trimmedPassword, 'trimmed-password-retry');
        } else if (error?.response?.status === 401 && looksLikeEmail) {
          response = await loginWithPayload(
            {
              identifier: normalizedIdentifier,
              password: sanitizedPassword,
            },
            'identifier-fallback',
          );
        } else {
          throw error;
        }
      }
    } catch (error: any) {
      if (error?.response?.status === 401) {
        throw new Error('Invalid email or password. Check your details and try again.');
      }
      throw error;
    }

    const data = unwrapData<any>(response.data);
    const accessToken: string | null = (data as any)?.accessToken ?? (data as any)?.token ?? null;
    const refreshToken: string | null = (data as any)?.refreshToken ?? null;

    if (!accessToken) {
      throw new Error('Login failed: missing access token');
    }

    await setAccessToken(accessToken);
    setApiAuthToken(accessToken);
    setToken(accessToken);
    setStatus('authenticated');

    if (refreshToken) {
      await setRefreshToken(refreshToken);
      setApiRefreshToken(refreshToken);
      setRefreshTokenState(refreshToken);
    }

    // Prefer server-provided user; else validate with /auth/profile.
    const rawUser = (data as any)?.user;
    const mappedUser = normalizeAuthUser(rawUser);
    if (mappedUser?.id) {
      setUser(mappedUser);
    } else {
      await validateToken();
    }
  }, [validateToken]);

  const signUp = useCallback(async (params: SignUpParams) => {
    const payload = {
      firstName: params.firstName.trim(),
      lastName: params.lastName.trim(),
      email: params.email.trim(),
      password: params.password,
      type: params.type ?? 'REGULAR',
      brandFullName: params.brandFullName?.trim() || undefined,
    };

    const response = await apiClient.post('/auth/signup', payload);
    const data = unwrapData<any>(response.data);

    // Backend may return token + user. If not, fall back to signIn.
    const accessToken: string | null = (data as any)?.accessToken ?? (data as any)?.token ?? null;
    const refreshToken: string | null = (data as any)?.refreshToken ?? null;

    if (accessToken) {
      await setAccessToken(accessToken);
      setApiAuthToken(accessToken);
      setToken(accessToken);
      setStatus('authenticated');
      if (refreshToken) {
        await setRefreshToken(refreshToken);
        setApiRefreshToken(refreshToken);
        setRefreshTokenState(refreshToken);
      }
      const rawUser = (data as any)?.user;
      const mappedUser = normalizeAuthUser(rawUser);
      if (mappedUser?.id) {
        setUser(mappedUser);
      } else {
        await validateToken();
      }
      return;
    }

    await signIn({ email: payload.email, password: payload.password });
  }, [signIn, validateToken]);

  useEffect(() => {
    if (bootstrappedRef.current) return;
    bootstrappedRef.current = true;

    let mounted = true;

    const run = async () => {
      try {
        const stored = await getAccessToken();
        const storedRefresh = await getRefreshToken();
        if (!mounted) return;

        if (!stored && !storedRefresh) {
          setApiAuthToken(null);
          setApiRefreshToken(null);
          setStatus('unauthenticated');
          setToken(null);
          setRefreshTokenState(null);
          setUser(null);
          return;
        }

        if (storedRefresh) {
          setApiRefreshToken(storedRefresh);
          setRefreshTokenState(storedRefresh);
        }

        if (stored) {
          setApiAuthToken(stored);
          setToken(stored);
        }

        // If access token is missing but refresh token exists, bootstrap a new access token.
        if (!stored && storedRefresh) {
          try {
            const refreshResponse = await apiClient.post('/auth/refresh', {
              refreshToken: storedRefresh,
            });
            const refreshed = unwrapData<any>(refreshResponse.data);
            const nextAccess: string | null =
              (refreshed as any)?.accessToken ?? (refreshed as any)?.token ?? null;
            const nextRefresh: string | null =
              (refreshed as any)?.refreshToken ?? null;

            if (nextAccess) {
              await setAccessToken(nextAccess);
              setApiAuthToken(nextAccess);
              setToken(nextAccess);
            }
            if (nextRefresh) {
              await setRefreshToken(nextRefresh);
              setApiRefreshToken(nextRefresh);
              setRefreshTokenState(nextRefresh);
            }
          } catch {
            await signOut({ notifyServer: false });
            return;
          }
        }

        // Validate against protected endpoint; on failure, sign out.
        await validateToken();
      } finally {
        if (mounted) {
          // validateToken sets status; ensure loading doesn't persist.
          setStatus((prev) => (prev === 'loading' ? 'unauthenticated' : prev));
        }
      }
    };

    void run();

    return () => {
      mounted = false;
    };
  }, [signOut, validateToken]);

  useEffect(() => {
    // Global 401 handler: clear token on unauthorized.
    setUnauthorizedHandler(() => {
      void signOut({ notifyServer: false });
    });

    return () => {
      setUnauthorizedHandler(null);
    };
  }, [signOut]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      isAuthenticated: status === 'authenticated',
      token,
      user,
      updateUser,
      validateToken,
      signIn,
      signUp,
      signOut,
    }),
    [status, token, user, updateUser, validateToken, signIn, signUp, signOut],
  );

  const sessionValue = useMemo<AuthSessionContextValue>(
    () => ({
      status,
      isAuthenticated: status === 'authenticated',
      token,
      userId: user?.id ?? null,
      userType: user?.type ?? null,
      updateUser,
      validateToken,
      signIn,
      signUp,
      signOut,
    }),
    [status, token, user?.id, user?.type, updateUser, validateToken, signIn, signUp, signOut],
  );

  return (
    <AuthSessionContext.Provider value={sessionValue}>
      <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
    </AuthSessionContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export function useAuthSession(): AuthSessionContextValue {
  const ctx = useContext(AuthSessionContext);
  if (!ctx) throw new Error('useAuthSession must be used within AuthProvider');
  return ctx;
}
