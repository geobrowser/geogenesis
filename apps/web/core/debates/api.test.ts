import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  geoChatAuthRetryDelay,
  getCurrentGeoChatUserId,
  getDebateActivity,
  getGeoChatAuthRetryAt,
  listDebateClaims,
  listDebateSharePrompts,
  resetGeoChatAuthState,
  syncGeoChatAuthAccount,
} from './api';

const session = {
  access_token: jwt({ user_id: 'user-a' }),
  refresh_token: 'refresh-token',
  expires_at: '2099-01-01T00:00:00.000Z',
};

beforeEach(() => {
  window.localStorage.clear();
  resetGeoChatAuthState();
  vi.restoreAllMocks();
});

describe('geo-chat session acquisition', () => {
  it('shares one session exchange across concurrent authenticated requests', async () => {
    const getIdentityToken = vi.fn().mockResolvedValue('identity-token');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async input => {
      const url = String(input);
      if (url.endsWith('/auth/session')) return jsonResponse(session);
      if (url.endsWith('/me/debate-activity')) return jsonResponse({ online: true });
      if (url.endsWith('/me/debate-share-prompts')) return jsonResponse({ prompts: [] });
      throw new Error(`Unexpected request: ${url}`);
    });

    await Promise.all([getDebateActivity(getIdentityToken), listDebateSharePrompts(getIdentityToken)]);

    expect(getIdentityToken).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls.filter(([input]) => String(input).endsWith('/auth/session'))).toHaveLength(1);
    expect(getCurrentGeoChatUserId()).toBe('user-a');
  });

  it('backs off failed exchanges while optional requests continue anonymously', async () => {
    const getIdentityToken = vi.fn().mockResolvedValue('identity-token');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async input => {
      const url = String(input);
      if (url.endsWith('/auth/session')) {
        return jsonResponse({ error: { message: 'invalid Privy identity token' } }, 401);
      }
      if (url.includes('/debate-claims')) return jsonResponse({ claims: [] });
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(getDebateActivity(getIdentityToken)).rejects.toThrow('invalid Privy identity token');
    await expect(getDebateActivity(getIdentityToken)).rejects.toThrow('invalid Privy identity token');
    await expect(listDebateClaims('space-1', ['claim-1'], getIdentityToken)).resolves.toEqual({ claims: [] });

    expect(getIdentityToken).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls.filter(([input]) => String(input).endsWith('/auth/session'))).toHaveLength(1);
    expect(fetchMock.mock.calls.filter(([input]) => String(input).includes('/debate-claims'))).toHaveLength(1);
  });

  it('uses retry delays capped at two minutes', () => {
    expect(geoChatAuthRetryDelay(0)).toBe(5_000);
    expect(geoChatAuthRetryDelay(1)).toBe(10_000);
    expect(geoChatAuthRetryDelay(20)).toBe(120_000);
  });

  it('clears the shared backoff after authentication recovers', async () => {
    let now = 1_000;
    let sessionAttempts = 0;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(globalThis, 'fetch').mockImplementation(async input => {
      const url = String(input);
      if (url.endsWith('/auth/session')) {
        sessionAttempts += 1;
        return sessionAttempts === 1
          ? jsonResponse({ error: { message: 'invalid Privy identity token' } }, 401)
          : jsonResponse(session);
      }
      if (url.endsWith('/me/debate-activity')) return jsonResponse({ online: true });
      throw new Error(`Unexpected request: ${url}`);
    });
    const getIdentityToken = vi.fn().mockResolvedValue('identity-token');

    await expect(getDebateActivity(getIdentityToken)).rejects.toThrow('invalid Privy identity token');
    expect(getGeoChatAuthRetryAt()).toBe(now + 5_000);

    now += 5_000;
    await expect(getDebateActivity(getIdentityToken)).resolves.toEqual({ online: true });
    expect(getGeoChatAuthRetryAt()).toBe(0);
    expect(getIdentityToken).toHaveBeenCalledTimes(2);
  });

  it('clears a stored geo-chat session when the Privy account changes', () => {
    window.localStorage.setItem('geo:chat-session', JSON.stringify(session));
    window.localStorage.setItem('geo:chat-account-id', 'privy-user-a');

    syncGeoChatAuthAccount('privy-user-a');
    expect(getCurrentGeoChatUserId()).toBe('user-a');

    syncGeoChatAuthAccount('privy-user-b');
    expect(getCurrentGeoChatUserId()).toBeNull();
  });
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function jwt(payload: object) {
  return `header.${window.btoa(JSON.stringify(payload)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')}.signature`;
}
