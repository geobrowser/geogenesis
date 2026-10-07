import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';

import * as React from 'react';

import { describe, expect, it, vi } from 'vitest';

import { GeoChatRequestError } from '../api';
import { debateQueryKeys } from '../hooks';
import { useRefreshLobbyClaimsOnRefusal } from './lobby-room-claims-hooks';

vi.mock('../hooks', async importOriginal => ({
  ...(await importOriginal<typeof import('../hooks')>()),
  useGeoChatAuth: () => ({ ready: true, authenticated: true, accountKey: 'acct', getPrivyIdentityToken: vi.fn() }),
}));

function setup() {
  const queryClient = new QueryClient();
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
  const { result } = renderHook(() => useRefreshLobbyClaimsOnRefusal('0192-abc'), {
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });
  return { refresh: result.current, invalidate };
}

describe('useRefreshLobbyClaimsOnRefusal', () => {
  it.each(['no_candidates_in_lobby', 'lobby_not_present'])('refetches the list on %s', code => {
    const { refresh, invalidate } = setup();
    refresh(new GeoChatRequestError('refused', code, 409));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: debateQueryKeys.lobbyClaims('acct', '0192-abc') });
  });

  it('leaves the list alone on other failures', () => {
    const { refresh, invalidate } = setup();
    refresh(new GeoChatRequestError('respond first', 'intent_missing', 409));
    refresh(new Error('offline'));
    expect(invalidate).not.toHaveBeenCalled();
  });
});
