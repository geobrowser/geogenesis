import { describe, expect, it } from 'vitest';

import { VARIANT_ATOMS, readUrlSeed } from './claims-tab';

/**
 * The URL seed used to be guarded by a `React.useRef`, which is reset by any remount while the query
 * it reads never changes.
 */
describe('readUrlSeed', () => {
  const EXPLORE_LINK = 'list=explore&spaces=space-a';

  it('gives the named list its seed', () => {
    expect(readUrlSeed('explore', EXPLORE_LINK)).toMatchObject({ spaceIds: ['space-a'] });
  });

  it('answers the same way however many times it is asked', () => {
    expect(readUrlSeed('explore', EXPLORE_LINK)).toMatchObject({ spaceIds: ['space-a'] });
    expect(readUrlSeed('explore', EXPLORE_LINK)).toMatchObject({ spaceIds: ['space-a'] });
  });

  /**
   * `LobbyTab` renders a `ClaimsTab` of its own with `variant="lobby"`
   */
  it('refuses a list the link did not name', () => {
    expect(readUrlSeed('lobby', EXPLORE_LINK)).toBeNull();
    expect(readUrlSeed('positions', EXPLORE_LINK)).toBeNull();
  });

  // A refusal for one list says nothing about another: the check is the link's own list, not a
  // first-come claim on it.
  it('answers each list on its own terms', () => {
    expect(readUrlSeed('lobby', EXPLORE_LINK)).toBeNull();
    expect(readUrlSeed('explore', EXPLORE_LINK)).toMatchObject({ spaceIds: ['space-a'] });
  });

  // A link naming no list is about Lobby: the workspace opens there and omits it as the default.
  it('treats a link with no list as naming Lobby', () => {
    expect(readUrlSeed('explore', 'spaces=space-a')).toBeNull();
    expect(readUrlSeed('lobby', 'spaces=space-a')).toMatchObject({ spaceIds: ['space-a'] });
  });

  it('reads each query on its own', () => {
    expect(readUrlSeed('explore', EXPLORE_LINK)).toMatchObject({ spaceIds: ['space-a'] });
    expect(readUrlSeed('explore', 'list=explore&spaces=space-b')).toMatchObject({ spaceIds: ['space-b'] });
  });

  it('carries search and topics too', () => {
    expect(readUrlSeed('positions', 'list=positions&q=nuclear&topics=t1,t2')).toMatchObject({
      search: 'nuclear',
      topicIds: ['t1', 't2'],
    });
  });
});

/**
 * The workspace applies the seed, not the list that draws it. `LobbyTab` renders `MatchesList` when
 * "Matches only" is on — which it is by default, and it survives the filter reset.
 */
describe('the atoms a seed is written into', () => {
  it('sends a list-less link to Lobby, which both of its branches read', () => {
    const seed = readUrlSeed('lobby', 'spaces=space-a&q=climate');

    expect(seed).toMatchObject({ spaceIds: ['space-a'], search: 'climate' });
    // The same atoms `MatchesList` reads, so the filters are on screen whichever branch draws.
    expect(VARIANT_ATOMS.lobby.spaceIds).toBe(VARIANT_ATOMS.lobby.spaceIds);
    expect(VARIANT_ATOMS.lobby.search).not.toBe(VARIANT_ATOMS.explore.search);
  });

  it('exposes an atom set for every list the URL can name', () => {
    for (const variant of ['explore', 'lobby', 'positions'] as const) {
      expect(VARIANT_ATOMS[variant]).toEqual(
        expect.objectContaining({
          spaceIds: expect.anything(),
          topicIds: expect.anything(),
          search: expect.anything(),
          seedSpent: expect.anything(),
        })
      );
    }
  });
});
