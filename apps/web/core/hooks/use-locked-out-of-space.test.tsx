import { cleanup, renderHook } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { addBackLink, useLockedOutOfSpace } from './use-locked-out-of-space';

const mocks = vi.hoisted(() => ({ personalSpaceId: 'me' as string | null, restricted: true }));

vi.mock('./use-personal-space-id', () => ({ usePersonalSpaceId: () => ({ personalSpaceId: mocks.personalSpaceId }) }));
vi.mock('./use-space', () => ({ useSpace: () => ({ space: { address: '0xdao' } }) }));
vi.mock('./use-fast-path-restricted', () => ({
  useIsFastPathRestricted: () => ({ isFastPathRestricted: mocks.restricted, isLoading: false }),
}));

beforeEach(() => {
  mocks.personalSpaceId = 'me';
  mocks.restricted = true;
});
afterEach(cleanup);

describe('useLockedOutOfSpace', () => {
  it('gives a restricted viewer the link an editor opens to add them', () => {
    const { result } = renderHook(() => useLockedOutOfSpace('abc'));
    expect(result.current).toEqual({ isLockedOut: true, link: `${window.location.origin}/space/abc?addBack=me` });
  });

  it('leaves Join alone for an unrestricted viewer', () => {
    mocks.restricted = false;
    const { result } = renderHook(() => useLockedOutOfSpace('abc'));
    expect(result.current.isLockedOut).toBe(false);
  });

  it('leaves Join alone for a signed-out viewer', () => {
    mocks.personalSpaceId = null;
    const { result } = renderHook(() => useLockedOutOfSpace('abc'));
    expect(result.current.isLockedOut).toBe(false);
  });
});

describe('addBackLink', () => {
  it('routes through the space path helper', () => {
    expect(addBackLink('https://geo.test', 'abc', 'me')).toBe('https://geo.test/space/abc?addBack=me');
  });
});
