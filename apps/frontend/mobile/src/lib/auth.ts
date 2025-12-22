import { createAuthClient } from "better-auth/react";
import { expoClient } from "@better-auth/expo/client";
import { customSessionClient } from "better-auth/client/plugins";
import type { Auth } from "@yourcompany/api/auth";
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

// Must match backend's `advanced.cookiePrefix`
const COOKIE_PREFIX = "yourcompany";

// Prefix for device storage keys (does not need to match cookiePrefix)
const STORAGE_PREFIX = "mobile";

const SESSION_DATA_KEY = `${STORAGE_PREFIX}_session_data`;

type AuthClient = ReturnType<typeof createAuthClient>;

type __authClientType = AuthClient;
export type AuthSession = __authClientType["$Infer"]["Session"];
export type AuthUser = __authClientType["$Infer"]["Session"]["user"];

let client: AuthClient | null = null;

export function initAuthClient(authUrl: string): AuthClient {
  if (client) return client;

  client = createAuthClient({
    baseURL: authUrl,
    plugins: [
      // @ts-expect-error - expoClient plugin is not typed correctly
      expoClient({
        scheme: "mobile", // Must match the scheme in app.json
        cookiePrefix: COOKIE_PREFIX, // Must match backend's advanced.cookiePrefix
        storagePrefix: STORAGE_PREFIX,
        storage: SecureStore,
      }),
      customSessionClient<Auth>(),
    ],
  });

  return client;
}

export function getAuthClient(): AuthClient {
  if (!client) {
    throw new Error(
      "Auth client not initialized. Call initAuthClient(authUrl) before using auth helpers."
    );
  }
  return client;
}

export const signIn = {
  email: (...args: Parameters<AuthClient["signIn"]["email"]>) =>
    getAuthClient().signIn.email(...args),
  social: (...args: Parameters<AuthClient["signIn"]["social"]>) =>
    getAuthClient().signIn.social(...args),
};

export const signUp = {
  email: (...args: Parameters<AuthClient["signUp"]["email"]>) =>
    getAuthClient().signUp.email(...args),
};

export const signOut = (...args: Parameters<AuthClient["signOut"]>) =>
  getAuthClient().signOut(...args);
export const resetPassword = (...args: Parameters<AuthClient["resetPassword"]>) =>
  getAuthClient().resetPassword(...args);
export const changeEmail = (...args: Parameters<AuthClient["changeEmail"]>) =>
  getAuthClient().changeEmail(...args);
export const changePassword = (...args: Parameters<AuthClient["changePassword"]>) =>
  getAuthClient().changePassword(...args);

/** Refetch session from server */
export const refetchSession = () => getAuthClient().getSession();

function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === "number") return Number.isFinite(value) ? new Date(value) : null;
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

function isSessionExpired(session: AuthSession): boolean {
  const expiresAt = toDate((session as any)?.session?.expiresAt);
  if (!expiresAt) return true;
  return expiresAt.getTime() <= Date.now();
}

export function getCachedSession(): AuthSession | null {
  if (Platform.OS === "web") return null;

  try {
    const raw = SecureStore.getItem(SESSION_DATA_KEY);
    if (!raw || raw === "{}") return null;
    const parsed = JSON.parse(raw) as AuthSession;
    if (!parsed || typeof parsed !== "object") return null;
    if (isSessionExpired(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Get authentication cookie string from device storage.
 */
export const getAuthCookie = (): string => {
  // Provided by `expoClient` plugin.
  return (getAuthClient() as unknown as { getCookie?: () => string }).getCookie?.() ?? "";
};

/**
 * Get authentication headers for server requests.
 * Returns headers object with `cookie` set from device storage.
 */
export const getAuthHeaders = (): Record<string, string> => {
  const cookies = getAuthCookie();
  if (!cookies) return {};
  return { cookie: cookies };
};

/**
 * Make an authenticated fetch request to your server.
 * Automatically includes auth cookies from device storage.
 */
export const authenticatedFetch = async (
  url: string,
  options: RequestInit = {}
): Promise<Response> => {
  if (Platform.OS === "web") {
    return fetch(url, {
      ...options,
      credentials: "include",
    });
  }

  const headers = new Headers(options.headers ?? undefined);
  const authHeaders = getAuthHeaders();
  for (const [key, value] of Object.entries(authHeaders)) {
    headers.set(key, value);
  }

  return fetch(url, {
    ...options,
    headers,
    // 'include' can interfere with the cookies we set manually in headers
    credentials: "omit",
  });
};
