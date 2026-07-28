import { renderHook } from '@testing-library/react';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useGeoLogoutCleanup } from './use-geo-logout';

const mocks = vi.hoisted(() => ({
  clearQueries: vi.fn(),
  disconnectCookie: vi.fn(),
  logoutSuccess: null as null | (() => Promise<void>),
  resetGeoChatSession: vi.fn(),
  setAtom: vi.fn(),
  setEditable: vi.fn(),
}));

vi.mock('@geogenesis/auth', () => ({
  useLogout: ({ onSuccess }: { onSuccess: () => Promise<void> }) => {
    mocks.logoutSuccess = onSuccess;
  },
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ clear: mocks.clearQueries }),
}));

vi.mock('jotai', () => ({ useSetAtom: () => mocks.setAtom }));
vi.mock('~/core/analytics', () => ({ loggedOut: vi.fn() }));
vi.mock('~/core/cookie', () => ({ Cookie: { onConnectionChange: mocks.disconnectCookie } }));
vi.mock('~/core/debates/api', () => ({ resetGeoChatSession: mocks.resetGeoChatSession }));
vi.mock('~/core/hooks/use-personal-space-id', () => ({ usePersonalSpaceId: () => ({ personalSpaceId: null }) }));
vi.mock('~/core/state/editable-store', () => ({ useEditable: () => ({ setEditable: mocks.setEditable }) }));
vi.mock('~/core/state/pending-personal-space', () => ({ pendingPersonalSpaceAtom: {} }));
vi.mock('~/partials/onboarding/dialog', () => ({
  avatarAtom: {},
  nameAtom: {},
  spaceIdAtom: {},
  stepAtom: {},
  topicIdAtom: {},
}));
vi.mock('~/atoms/dismissed-hints', () => ({ dismissedHintsAtom: {} }));

describe('useGeoLogoutCleanup', () => {
  beforeEach(() => {
    mocks.clearQueries.mockReset();
    mocks.disconnectCookie.mockReset();
    mocks.logoutSuccess = null;
    mocks.resetGeoChatSession.mockReset();
    mocks.setAtom.mockReset();
    mocks.setEditable.mockReset();
  });

  it('clears Geo Chat credentials and queries even when cookie disconnect fails', async () => {
    mocks.disconnectCookie.mockRejectedValue(new Error('cookie disconnect failed'));
    renderHook(() => useGeoLogoutCleanup());

    await expect(mocks.logoutSuccess!()).rejects.toThrow('cookie disconnect failed');

    expect(mocks.resetGeoChatSession).toHaveBeenCalledOnce();
    expect(mocks.clearQueries).toHaveBeenCalledOnce();
    expect(mocks.resetGeoChatSession.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.disconnectCookie.mock.invocationCallOrder[0]!
    );
    expect(mocks.clearQueries.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.disconnectCookie.mock.invocationCallOrder[0]!
    );
    expect(mocks.setAtom).toHaveBeenCalled();
  });
});
