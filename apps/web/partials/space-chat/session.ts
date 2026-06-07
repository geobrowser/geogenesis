import { getIdentityToken } from '@geogenesis/auth';

import { type GeoChatSession, createChatSession, refreshChatSession, revokeChatSession } from './api';

const STORAGE_KEY = 'geo:chat:session';
const EXPIRY_BUFFER_MS = 60_000;

type StoredGeoChatSession = {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
};

export async function resolveGeoChatAccessToken(): Promise<string | null> {
  const stored = readStoredGeoChatSession();

  if (stored && !isExpiringSoon(stored.expiresAt)) {
    return stored.accessToken;
  }

  if (stored?.refreshToken) {
    try {
      const refreshed = await refreshChatSession(stored.refreshToken);
      storeGeoChatSession(refreshed);
      return refreshed.access_token;
    } catch {
      clearStoredGeoChatSession();
    }
  }

  const identityToken = await getIdentityToken();
  if (!identityToken) return null;

  const session = await createChatSession(identityToken);
  storeGeoChatSession(session);
  return session.access_token;
}

export async function revokeStoredGeoChatSession() {
  const stored = readStoredGeoChatSession();
  clearStoredGeoChatSession();

  if (!stored) return;

  await revokeChatSession({
    accessToken: stored.accessToken,
    refreshToken: stored.refreshToken,
  });
}

export function readStoredGeoChatSession(): StoredGeoChatSession | null {
  if (typeof window === 'undefined') return null;

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<StoredGeoChatSession>;
    if (!parsed.accessToken || !parsed.refreshToken || !parsed.expiresAt) return null;

    return {
      accessToken: parsed.accessToken,
      refreshToken: parsed.refreshToken,
      expiresAt: parsed.expiresAt,
    };
  } catch {
    clearStoredGeoChatSession();
    return null;
  }
}

export function storeGeoChatSession(session: GeoChatSession) {
  if (typeof window === 'undefined') return;

  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      accessToken: session.access_token,
      refreshToken: session.refresh_token,
      expiresAt: session.expires_at,
    } satisfies StoredGeoChatSession)
  );
}

export function clearStoredGeoChatSession() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(STORAGE_KEY);
}

function isExpiringSoon(expiresAt: string) {
  const time = new Date(expiresAt).getTime();
  if (Number.isNaN(time)) return true;
  return time - EXPIRY_BUFFER_MS <= Date.now();
}
