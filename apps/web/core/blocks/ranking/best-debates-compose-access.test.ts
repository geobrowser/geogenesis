import { describe, expect, it } from 'vitest';

import { DEBATES_SPACE_ID } from './best-debates';
import { bestDebatesComposeMode, canComposeEditRanking } from './best-debates-compose-access';

const BEST = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const OTHER_SPACE = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

describe('who gets the Best debates ranking screen', () => {
  const mode = (overrides: Partial<Parameters<typeof bestDebatesComposeMode>[0]>) =>
    bestDebatesComposeMode({
      blockId: BEST,
      spaceId: DEBATES_SPACE_ID,
      hydrated: true,
      isLoadingAccess: false,
      debateRankingsFlag: true,
      canEdit: true,
      bestDebatesBlockId: BEST,
      ...overrides,
    });
  const show = (overrides: Partial<Parameters<typeof bestDebatesComposeMode>[0]>) => mode(overrides) === 'best-debates';

  it('a Debates member with the flag on, on the Best debates block', () => {
    expect(show({})).toBe(true);
  });

  it('nobody with the flag off, nobody who isn’t a member', () => {
    expect(show({ debateRankingsFlag: false })).toBe(false);
    expect(show({ canEdit: false })).toBe(false);
    expect(show({ canEdit: undefined })).toBe(false);
  });

  it('nothing on another block, in another space, or while the block id is unset', () => {
    expect(show({ blockId: 'cccccccccccccccccccccccccccccccc' })).toBe(false);
    expect(show({ spaceId: OTHER_SPACE })).toBe(false);
    expect(show({ bestDebatesBlockId: null })).toBe(false);
    expect(show({ bestDebatesBlockId: undefined })).toBe(false);
  });

  it('shows the loading state, not the generic screen, until the flag and membership are known', () => {
    expect(mode({ hydrated: false, debateRankingsFlag: false, canEdit: undefined })).toBe('loading');
    expect(mode({ isLoadingAccess: true, canEdit: undefined })).toBe('loading');
    expect(mode({ isLoadingAccess: false, canEdit: false })).toBe('generic');
    expect(mode({ debateRankingsFlag: false })).toBe('generic');
    // Other blocks never wait.
    expect(mode({ blockId: 'cccccccccccccccccccccccccccccccc', hydrated: false, isLoadingAccess: true })).toBe(
      'generic'
    );
  });

  it('every other block can always compose', () => {
    expect(canComposeEditRanking({ isBestDebates: false, debateRankingsFlag: false, canEdit: false })).toBe(true);
    expect(canComposeEditRanking({ isBestDebates: true, debateRankingsFlag: true, canEdit: false })).toBe(false);
  });
});
