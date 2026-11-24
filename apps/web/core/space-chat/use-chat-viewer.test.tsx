import { act, cleanup, renderHook } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { acceptedStatus, setGeoChatAccountStatus } from '~/core/debates/geo-chat-account-status';

vi.mock('~/core/debates/hooks', () => ({
  useGeoChatAuth: () => ({ ready: true, authenticated: true, accountKey: 'account', getPrivyIdentityToken: vi.fn() }),
}));
vi.mock('~/core/debates/use-current-geo-chat-user-id', () => ({ useCurrentGeoChatUserId: () => 'user' }));

const { useChatViewer } = await import('./hooks');

const profile = (personId: string | null) => ({
  state: personId ? ('attached' as const) : ('pending' as const),
  profile_space_id: 'space',
  person_id: personId,
  display_name: null,
  avatar_cid: null,
  pending_since: null,
  retry_after_ms: null,
});

afterEach(cleanup);

describe('useChatViewer (GEO-3818)', () => {
  it('picks up a person id that arrives after mount under the same user id', () => {
    setGeoChatAccountStatus('account', acceptedStatus(profile(null)));
    const { result } = renderHook(() => useChatViewer());
    expect(result.current).toEqual({ userId: 'user', personId: null });

    act(() => setGeoChatAccountStatus('account', acceptedStatus(profile('person'))));
    expect(result.current).toEqual({ userId: 'user', personId: 'person' });
  });
});
