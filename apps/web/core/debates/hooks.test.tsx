import { renderHook } from '@testing-library/react';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useGeoChatAuth } from './hooks';

const mocks = vi.hoisted(() => ({
  getIdentityToken: vi.fn(),
  getAccessToken: vi.fn(),
}));

vi.mock('@geogenesis/auth', () => ({
  getIdentityToken: mocks.getIdentityToken,
  usePrivy: () => ({
    ready: true,
    authenticated: true,
    getAccessToken: mocks.getAccessToken,
  }),
}));

describe('useGeoChatAuth', () => {
  beforeEach(() => {
    mocks.getIdentityToken.mockReset();
    mocks.getAccessToken.mockReset();
  });

  it('uses the Privy identity token for geo-chat session exchange', async () => {
    mocks.getIdentityToken.mockResolvedValue('identity-token');
    mocks.getAccessToken.mockResolvedValue('access-token');

    const { result } = renderHook(() => useGeoChatAuth());

    await expect(result.current.getPrivyIdentityToken()).resolves.toBe('identity-token');
    expect(mocks.getIdentityToken).toHaveBeenCalledTimes(1);
    expect(mocks.getAccessToken).not.toHaveBeenCalled();
  });
});
