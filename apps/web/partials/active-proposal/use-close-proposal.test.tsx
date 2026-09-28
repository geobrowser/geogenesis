import { renderHook } from '@testing-library/react';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useCloseProposal } from './use-close-proposal';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  search: '',
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
  useSearchParams: () => new URLSearchParams(mocks.search),
}));

const SPACE = 'b7ebce52523244058f81f4aeb95a0b8e';
const PROFILE_SPACE = 'f3dab79cb5a3d9d1759656dd5361d1c6';

function close(search: string) {
  mocks.search = search;
  const { result } = renderHook(() => useCloseProposal(SPACE));
  result.current();
  return mocks.push.mock.calls.at(-1)?.[0] as string | undefined;
}

describe('useCloseProposal', () => {
  beforeEach(() => {
    mocks.push.mockClear();
  });

  it('goes to the space’s governance tab by default', () => {
    expect(close('')).toBe(`/space/${SPACE}/governance`);
  });

  it('goes back to the profile the reader came from', () => {
    // A person's proposals span every space they proposed into, so the space in
    // the route is routinely one the reader has never opened.
    expect(close(`from=profile&returnSpaceId=${PROFILE_SPACE}`)).toBe(`/space/${PROFILE_SPACE}/proposals`);
  });

  it('ignores a return id that is not an id', () => {
    // This reaches the router straight from the URL bar.
    expect(close('from=profile&returnSpaceId=../../evil')).toBe(`/space/${SPACE}/governance`);
    expect(close('from=profile&returnSpaceId=')).toBe(`/space/${SPACE}/governance`);
    expect(close('from=profile')).toBe(`/space/${SPACE}/governance`);
  });

  it('still honours the home return path', () => {
    // `returnSearch` arrives percent-encoded and is read back decoded, which is
    // what makes it a query string again rather than one opaque value.
    expect(close('from=home&returnSearch=tab%3Dpending')).toBe('/home?tab=pending');
    expect(close('from=home')).toBe('/home');
  });

  it('ignores a returnSpaceId that did not come from a profile', () => {
    expect(close(`returnSpaceId=${PROFILE_SPACE}`)).toBe(`/space/${SPACE}/governance`);
  });
});
