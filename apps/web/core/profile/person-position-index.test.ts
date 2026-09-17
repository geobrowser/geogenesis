import { describe, expect, it } from 'vitest';

import {
  type PersonPositionIndex,
  type PositionIndexEntry,
  facetsFrom,
  matchingEntityIds,
  narrowedFacets,
  preferredSpacesFor,
} from './use-person-position-index';

/**
 * The filters on the Positions tab, over a complete index (GEO-2918).
 *
 * Two rules carry the whole behaviour and neither is guessable from the call
 * site: **spaces are OR, topics are AND**, and the facet counts narrow
 * asymmetrically because of it. The same asymmetry is documented on
 * `HubMultiFilterMenu`, which draws these menus for the debates hub.
 */
const entry = (entityId: string, spaceIds: string[], topicIds: string[]): PositionIndexEntry => ({
  entityId,
  spaceIds,
  topicIds,
});

function indexOf(entries: PositionIndexEntry[], names: Record<string, string> = {}): PersonPositionIndex {
  const nameMap = new Map<string, string | null>(Object.entries(names));

  return {
    entries,
    topics: facetsFrom(entries, e => e.topicIds, nameMap),
    spaces: facetsFrom(entries, e => e.spaceIds, new Map()),
  };
}

// Three claims: one about AI in the Crypto space, one about AI *and* society in
// Academia, one about society alone in Crypto.
const INDEX = indexOf(
  [
    entry('claim-ai', ['crypto'], ['ai']),
    entry('claim-both', ['academia'], ['ai', 'society']),
    entry('claim-society', ['crypto'], ['society']),
  ],
  { ai: 'AI systems', society: 'Society' }
);

describe('facetsFrom', () => {
  it('counts how many claims carry each value', () => {
    expect(INDEX.topics).toEqual([
      { id: 'ai', name: 'AI systems', count: 2 },
      { id: 'society', name: 'Society', count: 2 },
    ]);
  });

  it('orders by count, then name, so the menu does not reshuffle between renders', () => {
    const index = indexOf([entry('a', [], ['rare']), entry('b', [], ['common']), entry('c', [], ['common'])], {
      common: 'Common',
      rare: 'Rare',
    });

    expect(index.topics.map(topic => topic.id)).toEqual(['common', 'rare']);
  });
});

describe('matchingEntityIds', () => {
  it('keeps everything when nothing is picked', () => {
    expect(matchingEntityIds(INDEX, { spaceIds: [], topicIds: [] })).toHaveLength(3);
  });

  it('ORs spaces — a second space can only add', () => {
    expect(matchingEntityIds(INDEX, { spaceIds: ['crypto', 'academia'], topicIds: [] })).toHaveLength(3);
    expect(matchingEntityIds(INDEX, { spaceIds: ['academia'], topicIds: [] })).toEqual(['claim-both']);
  });

  it('ANDs topics — a second topic can only narrow', () => {
    expect(matchingEntityIds(INDEX, { spaceIds: [], topicIds: ['ai'] })).toEqual(['claim-ai', 'claim-both']);
    expect(matchingEntityIds(INDEX, { spaceIds: [], topicIds: ['ai', 'society'] })).toEqual(['claim-both']);
  });

  it('applies both dimensions together', () => {
    expect(matchingEntityIds(INDEX, { spaceIds: ['crypto'], topicIds: ['ai'] })).toEqual(['claim-ai']);
  });

  // Ids reach this from three sources that spell them differently.
  it('matches however the ids are spelled', () => {
    const dashed = indexOf([entry('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', ['ssssssss'], ['tttttttt'])]);

    expect(matchingEntityIds(dashed, { spaceIds: ['SSSSSSSS'], topicIds: ['TTTTTTTT'] })).toHaveLength(1);
  });
});

describe('narrowedFacets', () => {
  it('answers "what would I be left with", not "what is there"', () => {
    const { topics } = narrowedFacets(INDEX, { spaceIds: [], topicIds: ['ai'] });

    // Society co-occurs with AI on exactly one claim.
    expect(topics.find(topic => topic.id === 'society')?.count).toBe(1);
  });

  it('narrows the space menu by the topics but never by itself', () => {
    // Spaces are OR: ticking Crypto must not make Academia look empty, or the
    // reader can never widen a selection they have already begun.
    const { spaces } = narrowedFacets(INDEX, { spaceIds: ['crypto'], topicIds: [] });

    expect(spaces.find(space => space.id === 'academia')?.count).toBe(1);
    expect(spaces.find(space => space.id === 'crypto')?.count).toBe(2);
  });

  it('does narrow the space menu by a topic selection', () => {
    const { spaces } = narrowedFacets(INDEX, { spaceIds: [], topicIds: ['ai', 'society'] });

    expect(spaces.find(space => space.id === 'academia')?.count).toBe(1);
    expect(spaces.find(space => space.id === 'crypto')?.count).toBe(0);
  });

  it('keeps an option that has fallen to zero rather than dropping it', () => {
    // The row you just picked would otherwise be the first to vanish, and a menu
    // that reorders under the cursor hides that a pick led nowhere.
    const { topics } = narrowedFacets(INDEX, { spaceIds: ['crypto'], topicIds: ['ai', 'society'] });

    expect(topics.map(topic => topic.id).sort()).toEqual(['ai', 'society']);
    expect(topics.every(topic => topic.count === 0)).toBe(true);
  });
});

/**
 * Which space a filtered claim is shown in.
 *
 * 4% of the reference account's claims live in more than one space, and 7% of
 * the busiest voter's. `pickDisplaySpaceId` takes the first of an entity's
 * spaces by default, so without a preference, filtering to one space renders
 * those claims labelled and linked to another — the card contradicting the
 * control that produced it.
 */
describe('preferredSpacesFor', () => {
  const multi = indexOf([entry('claim-both', ['crypto', 'academia'], []), entry('claim-crypto', ['crypto'], [])]);

  it('has no preference when no space is picked', () => {
    // Nothing was asked for, so there is nothing to honour.
    expect(preferredSpacesFor(multi, { spaceIds: [] }).size).toBe(0);
  });

  it('shows a multi-space claim in the space that was picked', () => {
    expect(preferredSpacesFor(multi, { spaceIds: ['academia'] }).get('claim-both')).toBe('academia');
  });

  it("follows the reader's order, not the entity's", () => {
    // The entity lists crypto first. Picking academia first has to win, or a
    // second pick silently moves where the first one's claims appear.
    expect(preferredSpacesFor(multi, { spaceIds: ['academia', 'crypto'] }).get('claim-both')).toBe('academia');
    expect(preferredSpacesFor(multi, { spaceIds: ['crypto', 'academia'] }).get('claim-both')).toBe('crypto');
  });

  it('leaves out a claim that is in none of the picked spaces', () => {
    const preferred = preferredSpacesFor(multi, { spaceIds: ['academia'] });

    expect(preferred.has('claim-crypto')).toBe(false);
  });

  it('matches however the ids are spelled', () => {
    const dashed = indexOf([entry('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', ['ssssssss'], [])]);

    expect(preferredSpacesFor(dashed, { spaceIds: ['SSSSSSSS'] }).get('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')).toBe(
      'ssssssss'
    );
  });
});
