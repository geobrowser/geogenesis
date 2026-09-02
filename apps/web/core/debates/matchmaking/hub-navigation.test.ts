import { describe, expect, it } from 'vitest';

import { hubClosesOnArrivalAt } from './hub-navigation';

const SPACE = 'space-1';

describe('hubClosesOnArrivalAt', () => {
  // The two rooms the hub must not sit on top of. Accepting a request walks the viewer straight
  // into the first of them, which is what the old blanket close existed for.
  it.each([
    ['a debate room', `/space/${SPACE}/debates/debate-1`],
    ['a rematch room', `/space/${SPACE}/debates/rematches/session-1`],
  ])('closes on arriving at %s', (_label, pathname) => {
    expect(hubClosesOnArrivalAt(pathname)).toBe(true);
  });

  // GEO-2788. Everything here is browsing, and closing the hub on any of it is what made the
  // Claims tab a dead end: following a claim shut the list you were working through.
  it.each([
    ['the debates feed', `/space/${SPACE}/debates`],
    ['a claim or entity page', `/space/${SPACE}/entity-1`],
    ['a space home page, which is also a profile', `/space/${SPACE}`],
    ['Explore', '/explore'],
    ['the root space', '/root'],
    ['a space community tab', `/space/${SPACE}/community`],
  ])('stays open on arriving at %s', (_label, pathname) => {
    expect(hubClosesOnArrivalAt(pathname)).toBe(false);
  });

  // `/rematches` on its own is not a route. Reading the bare segment as a room would close the hub
  // on a path that renders nothing.
  it('does not treat the bare rematches segment as a room', () => {
    expect(hubClosesOnArrivalAt(`/space/${SPACE}/debates/rematches`)).toBe(false);
  });

  it('ignores a trailing slash', () => {
    expect(hubClosesOnArrivalAt(`/space/${SPACE}/debates/debate-1/`)).toBe(true);
    expect(hubClosesOnArrivalAt(`/space/${SPACE}/debates/`)).toBe(false);
  });

  // A `debates` segment somewhere other than a space route is not a debate room — the check is
  // positional rather than a substring match, and this is what says so.
  it('only reads debates under a space route', () => {
    expect(hubClosesOnArrivalAt('/debates/debate-1')).toBe(false);
    expect(hubClosesOnArrivalAt('/explore/debates/debate-1')).toBe(false);
  });
});
