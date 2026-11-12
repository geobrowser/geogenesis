import { describe, expect, it } from 'vitest';

import { DEBATES_SPACE_ID } from './best-debates';
import { canComposeEditRanking, showBestDebatesCompose } from './best-debates-compose-access';

const BEST = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const OTHER_SPACE = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

describe('who gets the Best debates ranking screen', () => {
  const show = (overrides: Partial<Parameters<typeof showBestDebatesCompose>[0]>) =>
    showBestDebatesCompose({
      blockId: BEST,
      spaceId: DEBATES_SPACE_ID,
      debateRankingsFlag: true,
      canEdit: true,
      bestDebatesBlockId: BEST,
      ...overrides,
    });

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

  it('every other block can always compose', () => {
    expect(canComposeEditRanking({ isBestDebates: false, debateRankingsFlag: false, canEdit: false })).toBe(true);
    expect(canComposeEditRanking({ isBestDebates: true, debateRankingsFlag: true, canEdit: false })).toBe(false);
  });
});
