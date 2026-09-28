import { describe, expect, it } from 'vitest';

import { SUBSCRIBE_SOURCE_GROUPS, groupIdForSource } from './subscribe-source';

describe('groupIdForSource', () => {
  it('resolves a known surface to its group', () => {
    expect(groupIdForSource('explore')).toBe(SUBSCRIBE_SOURCE_GROUPS.explore);
  });

  // The endpoint is an anonymous write. If the body could name a group, anyone could file
  // addresses into any group on the account — including ones live campaigns send to.
  it('refuses to take a group from the request body', () => {
    for (const attempt of [
      '176089367484302771', // a real group id, as if the caller had looked it up
      'Crypto',
      'explore_opt_in',
      'Early Access Signup',
    ]) {
      expect(groupIdForSource(attempt)).toBeNull();
    }
  });

  it('is null for anything unrecognised, rather than guessing', () => {
    for (const value of [undefined, null, '', 'Explore', 'EXPLORE', ' explore ', 42, {}, []]) {
      expect(groupIdForSource(value)).toBeNull();
    }
  });

  // `{}` inherits `toString`, `constructor` and friends, so a bare `in` or a property read would
  // resolve them and hand back a function where an id belongs.
  it('is not fooled by inherited object properties', () => {
    for (const value of ['toString', 'constructor', '__proto__', 'hasOwnProperty', 'valueOf']) {
      expect(groupIdForSource(value)).toBeNull();
    }
  });
});
