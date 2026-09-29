import { beforeEach, describe, expect, it } from 'vitest';

import { resetUrlSeedsForTests, takeUrlSeed } from './claims-tab';

beforeEach(resetUrlSeedsForTests);

/**
 * The URL seed used to be guarded by a `React.useRef`, which is reset by any remount while the query
 * it reads never changes.
 */
describe('takeUrlSeed', () => {
  const EXPLORE_LINK = 'list=explore&spaces=space-a';

  it('gives the named list its seed', () => {
    expect(takeUrlSeed('explore', EXPLORE_LINK)).toMatchObject({ spaceIds: ['space-a'] });
  });

  // The whole point: a remount asks again, and must be told no.
  it('gives it once, however many times it is asked', () => {
    expect(takeUrlSeed('explore', EXPLORE_LINK)).not.toBeNull();
    expect(takeUrlSeed('explore', EXPLORE_LINK)).toBeNull();
    expect(takeUrlSeed('explore', EXPLORE_LINK)).toBeNull();
  });

  /**
   * `LobbyTab` renders a `ClaimsTab` of its own with `variant="lobby"`
   */
  it('refuses a list the link did not name', () => {
    expect(takeUrlSeed('lobby', EXPLORE_LINK)).toBeNull();
    expect(takeUrlSeed('positions', EXPLORE_LINK)).toBeNull();
  });

  // Still available to the list it was meant for, after another variant has asked and been refused.
  it('keeps the seed for its own list when another asks first', () => {
    expect(takeUrlSeed('lobby', EXPLORE_LINK)).toBeNull();
    expect(takeUrlSeed('explore', EXPLORE_LINK)).toMatchObject({ spaceIds: ['space-a'] });
  });

  // A link naming no list is about Lobby: the workspace opens there and omits it as the default.
  it('treats a link with no list as naming Lobby', () => {
    expect(takeUrlSeed('explore', 'spaces=space-a')).toBeNull();
    expect(takeUrlSeed('lobby', 'spaces=space-a')).toMatchObject({ spaceIds: ['space-a'] });
  });

  // A different link is a different intent, so it gets its own turn.
  it('seeds again for a different query', () => {
    expect(takeUrlSeed('explore', EXPLORE_LINK)).not.toBeNull();
    expect(takeUrlSeed('explore', 'list=explore&spaces=space-b')).toMatchObject({ spaceIds: ['space-b'] });
  });

  it('carries search and topics too', () => {
    expect(takeUrlSeed('positions', 'list=positions&q=nuclear&topics=t1,t2')).toMatchObject({
      search: 'nuclear',
      topicIds: ['t1', 't2'],
    });
  });
});
