import { describe, expect, it } from 'vitest';

import { UNFILTERED_BOUNTY_SCOPE } from './bounty-filters';
import { applyFilters } from './community-bounties-sections';

type Bounty = Parameters<typeof applyFilters>[0][number];

function bounty(id: string, isFeatured: boolean): Bounty {
  return { id, isFeatured, difficulty: null, skills: [] } as unknown as Bounty;
}

const BOUNTIES = [bounty('featured', true), bounty('plain', false)];
/** Empty sets read as "everything", so these leave only the scope doing any work. */
const ANY_DIFFICULTY = new Set<string>();
const ANY_SKILL = new Set<string>();

describe('the unfiltered bounty scope', () => {
  // The invariant "Show all" rests on. Asserted against the filter rather than against the
  // constant's value, so it still holds if the scopes are ever reordered or renamed — which is the
  // edit that would otherwise turn an empty state's escape hatch into a button that reproduces it.
  it('excludes nothing', () => {
    const kept = applyFilters(BOUNTIES, UNFILTERED_BOUNTY_SCOPE, ANY_DIFFICULTY, ANY_SKILL, []);

    expect(kept.map(entry => entry.id)).toEqual(['featured', 'plain']);
  });

  // The counterpart, so the case above cannot pass merely because the scope does nothing at all.
  it('is not Featured, which does exclude', () => {
    const kept = applyFilters(BOUNTIES, 'featured', ANY_DIFFICULTY, ANY_SKILL, []);

    expect(kept.map(entry => entry.id)).toEqual(['featured']);
  });
});
