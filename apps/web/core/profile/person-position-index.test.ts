import { describe, expect, it } from 'vitest';

import {
  type PersonPositionIndex,
  type PositionIndexEntry,
  facetsFrom,
  matchingEntityIds,
  narrowedFacets,
  preferredSpacesFor,
  reachableTopicFacets,
} from './use-person-position-index';

/**
 * The filters on the Positions tab, over a complete index (GEO-2918).
 *
 * Two rules carry the whole behaviour and neither is guessable from the call
 * site: **spaces are OR, topics are AND**, and the facet counts narrow
 * asymmetrically because of it. The same asymmetry is documented on
 * `HubMultiFilterMenu`, which draws these menus for the debates hub.
 */
/**
 * A claim whose topics are assigned in every space it lives in.
 *
 * The ordinary case — 199 of the reference account's 208 claims are in one space
 * — and the shape the first version of this index assumed for all of them. Use
 * `spacedEntry` for the case it got wrong.
 */
const entry = (entityId: string, spaceIds: string[], topicIds: string[]): PositionIndexEntry => ({
  entityId,
  spaceIds,
  topicIds,
  topicsBySpace: new Map(spaceIds.map(spaceId => [spaceId, new Set(topicIds)])),
});

/** A claim whose topics differ by space, which every multi-space claim measured does. */
const spacedEntry = (entityId: string, topicsBySpace: Record<string, string[]>): PositionIndexEntry => ({
  entityId,
  spaceIds: Object.keys(topicsBySpace),
  topicIds: [...new Set(Object.values(topicsBySpace).flat())],
  topicsBySpace: new Map(Object.entries(topicsBySpace).map(([spaceId, topics]) => [spaceId, new Set(topics)])),
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

/**
 * A topic belongs to the space its relation was written in (GEO-2918).
 *
 * The graph records topics per space, so a claim in two spaces can carry a topic
 * in one and not the other — and **every multi-space claim measured does**: 9 of
 * 9 on the reference account, 13 of 15 on the busiest, each with its topics
 * entirely in one of its spaces.
 *
 * Pooling them let a Space-A + Topic-T filter match a claim whose T was only
 * ever assigned in Space B, and `preferredSpacesFor` then drew the card in A,
 * where the topic the reader had filtered by does not exist. The two dimensions
 * have to be satisfied by the same space. `claimTopicsById` in the debates hub
 * keeps the space for the same reason.
 */
describe('topics are space-scoped', () => {
  // Topics in Academia only; the claim also lives in Crypto.
  const split = indexOf([spacedEntry('claim-split', { crypto: [], academia: ['ai'] })], { ai: 'AI systems' });

  it('matches the space where the topic actually is', () => {
    expect(matchingEntityIds(split, { spaceIds: ['academia'], topicIds: ['ai'] })).toEqual(['claim-split']);
  });

  it('does not match a space the topic was never assigned in', () => {
    expect(matchingEntityIds(split, { spaceIds: ['crypto'], topicIds: ['ai'] })).toEqual([]);
  });

  it('still matches on the topic alone, wherever it was written', () => {
    // The reader asked about a topic, not about where it was recorded.
    expect(matchingEntityIds(split, { spaceIds: [], topicIds: ['ai'] })).toEqual(['claim-split']);
  });

  it('still matches on the space alone', () => {
    expect(matchingEntityIds(split, { spaceIds: ['crypto'], topicIds: [] })).toEqual(['claim-split']);
  });

  it('shows the card in the space that satisfied the filter', () => {
    const preferred = preferredSpacesFor(split, { spaceIds: [], topicIds: ['ai'] });

    // Not `crypto`, which is the entity's first space and carries no topics.
    expect(preferred.get('claim-split')).toBe('academia');
  });

  it('requires one space to satisfy every topic, not two between them', () => {
    const scattered = indexOf([spacedEntry('claim-two', { crypto: ['ai'], academia: ['society'] })]);

    expect(matchingEntityIds(scattered, { spaceIds: [], topicIds: ['ai'] })).toEqual(['claim-two']);
    expect(matchingEntityIds(scattered, { spaceIds: [], topicIds: ['ai', 'society'] })).toEqual([]);
  });

  it('counts a topic only where the reader is looking', () => {
    const { topics } = narrowedFacets(split, { spaceIds: ['crypto'], topicIds: [] });

    // Offering "AI systems" here would be offering a row that leads nowhere.
    expect(topics.find(topic => topic.id === 'ai')?.count).toBe(0);
  });

  it('counts it where it is', () => {
    const { topics } = narrowedFacets(split, { spaceIds: ['academia'], topicIds: [] });

    expect(topics.find(topic => topic.id === 'ai')?.count).toBe(1);
  });
});

/**
 * A count is a promise, and the menu has to keep it.
 *
 * Every option says how many claims ticking it would leave. Two earlier versions
 * of `narrowedFacets` broke that by filtering once and tallying what survived:
 * the space menu counted every space of a claim that had matched in only one of
 * them, and the topic menu unioned a claim's topics across spaces that were
 * never candidates together. Both advertised a positive number on an option that
 * emptied the list when ticked — which is the one thing these counts exist to
 * prevent.
 *
 * So the invariant is checked directly: for every option, the number shown and
 * the number of rows that follow have to be the same.
 */
describe('facet counts are what ticking the option gives you', () => {
  const split = indexOf(
    [
      spacedEntry('claim-split', { crypto: [], academia: ['ai'] }),
      spacedEntry('claim-scattered', { crypto: ['ai'], academia: ['society'] }),
      entry('claim-plain', ['crypto'], ['ai']),
    ],
    { ai: 'AI systems', society: 'Society' }
  );

  const selections = [
    { spaceIds: [], topicIds: [] },
    { spaceIds: ['crypto'], topicIds: [] },
    { spaceIds: ['academia'], topicIds: [] },
    { spaceIds: [], topicIds: ['ai'] },
    { spaceIds: [], topicIds: ['society'] },
    { spaceIds: ['crypto'], topicIds: ['ai'] },
    { spaceIds: ['academia'], topicIds: ['ai'] },
  ];

  it.each(selections)('holds for spaces=$spaceIds topics=$topicIds', selection => {
    const { spaces, topics } = narrowedFacets(split, selection);

    for (const facet of spaces) {
      // Spaces are OR: the option replaces the space selection rather than adding to it.
      const after = matchingEntityIds(split, { spaceIds: [facet.id], topicIds: selection.topicIds });
      expect(facet.count).toBe(after.length);
    }

    for (const facet of topics) {
      // Topics are AND: the option is added to what is already picked.
      const after = matchingEntityIds(split, {
        spaceIds: selection.spaceIds,
        topicIds: [...selection.topicIds, facet.id],
      });
      expect(facet.count).toBe(after.length);
    }
  });

  // The specific shape that was wrong: a claim matching in one space only.
  it('does not credit a space the claim did not match in', () => {
    const { spaces } = narrowedFacets(split, { spaceIds: [], topicIds: ['ai'] });

    // `claim-split` carries AI in academia alone, so Crypto must not count it.
    // Crypto still holds `claim-scattered` and `claim-plain`, which carry AI there.
    expect(spaces.find(space => space.id === 'crypto')?.count).toBe(2);
    expect(spaces.find(space => space.id === 'academia')?.count).toBe(1);
  });

  it('does not offer a topic that cannot co-occur in one space', () => {
    // `claim-scattered` has AI in crypto and Society in academia. With AI picked,
    // Society is unreachable — and must say so rather than counting the claim.
    const { topics } = narrowedFacets(split, { spaceIds: [], topicIds: ['ai'] });

    expect(topics.find(topic => topic.id === 'society')?.count).toBe(0);
  });
});

/**
 * The topic menu offers only what leads somewhere (GEO-2918).
 *
 * Topics are AND, so most of a long menu is unreachable at any moment: picking
 * one space takes 254 of the reference account's 349 topics to zero. Showing
 * those rows made a filter that works correctly read as a broken one — a column
 * of zeroes with no way to tell which row would do anything.
 *
 * The reason they were once kept was that a menu removing rows as you tick them
 * reorders under the cursor. Pinning the picked ones answers that instead.
 */
describe('reachableTopicFacets', () => {
  const facet = (id: string, count: number) => ({ id, name: id.toUpperCase(), count });

  it('drops a topic nothing would be left by', () => {
    const shown = reachableTopicFacets([facet('ai', 3), facet('dead', 0)], []);

    expect(shown.map(topic => topic.id)).toEqual(['ai']);
  });

  it('orders the rest by how much they would leave', () => {
    const shown = reachableTopicFacets([facet('few', 1), facet('many', 9), facet('some', 4)], []);

    expect(shown.map(topic => topic.id)).toEqual(['many', 'some', 'few']);
  });

  it('pins the picked ones to the top, in the order they were picked', () => {
    // The rows being worked with are the ones that must hold still: their counts
    // change on every tick, so ordering them by count reshuffles exactly the
    // rows the reader is using.
    const shown = reachableTopicFacets([facet('big', 9), facet('second', 2), facet('first', 1)], ['first', 'second']);

    expect(shown.map(topic => topic.id)).toEqual(['first', 'second', 'big']);
  });

  it('has nothing to offer when every topic is unreachable', () => {
    expect(reachableTopicFacets([facet('a', 0), facet('b', 0)], [])).toEqual([]);
  });

  it('keeps a picked topic that still leads somewhere', () => {
    // A picked topic's own count is the current result size, so it is only zero
    // when the whole result is — which is the case `keepSelectableTopics` undoes.
    const shown = reachableTopicFacets([facet('picked', 2), facet('other', 5)], ['picked']);

    expect(shown.map(topic => topic.id)).toEqual(['picked', 'other']);
  });
});
