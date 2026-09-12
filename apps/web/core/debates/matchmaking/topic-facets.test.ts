import { describe, expect, it } from 'vitest';

import { TOPICS_PROPERTY_ID } from '~/core/claims/ontology';
import type { MatchmakingTopic } from '~/core/debates/api';
import { normId } from '~/core/utils/norm-id';

import {
  availableTopics,
  carriesEveryTopic,
  claimTopicsById,
  formatFacetCount,
  keepSelectableTopic,
  keepSelectableTopics,
  keepSelectedVisible,
  orderFacetOptions,
  topicsFor,
} from './topic-facets';

const ai: MatchmakingTopic = { id: 'topic-ai', name: 'AI' };
const health: MatchmakingTopic = { id: 'topic-health', name: 'Health' };
const unnamed: MatchmakingTopic = { id: 'topic-unnamed', name: null };

// Keyed as `claimTopicsById` keys it, and carrying the relation's space as it does — `null` here,
// which is "unknown" and so never narrows.
const topicsByClaimId = new Map<string, Array<MatchmakingTopic & { spaceId: string | null }>>(
  (
    [
      ['claim-in-crypto', [ai]],
      ['claim-in-health', [health]],
      ['claim-in-both', [ai, health]],
      ['claim-unnamed-topic', [unnamed]],
    ] as const
  ).map(([claimId, topics]) => [normId(claimId), topics.map(topic => ({ ...topic, spaceId: null }))])
);

describe('claimTopicsById', () => {
  const TYPE_PROPERTY = '8f151ba4de204e3c9cb499ddf96f48f1';

  function entity(id: string, relations: { topicId: string; name?: string | null; isDeleted?: boolean }[]) {
    return {
      id,
      relations: relations.map(relation => ({
        type: { id: relation.topicId === 'not-a-topic' ? TYPE_PROPERTY : TOPICS_PROPERTY_ID },
        isDeleted: relation.isDeleted,
        toEntity: { id: relation.topicId, name: relation.name ?? null },
      })),
    };
  }

  it('keys each claim entity by id, carrying the topics it points at', () => {
    const map = claimTopicsById([entity('claim-1', [{ topicId: 'topic-ai', name: 'AI' }])]);

    expect(topicsFor(map, 'claim-1')).toEqual([ai]);
  });

  // The rule the three call sites were each spelling out: a relation of another type is not a
  // topic, and a deleted one is not one either.
  it('reads only live topic relations', () => {
    const map = claimTopicsById([
      entity('claim-1', [
        { topicId: 'topic-ai', name: 'AI' },
        { topicId: 'topic-health', name: 'Health', isDeleted: true },
        { topicId: 'not-a-topic', name: 'Claim' },
      ]),
    ]);

    expect(topicsFor(map, 'claim-1')).toEqual([ai]);
  });

  // So `topicsFor(map, id) ?? []` and `carriesEveryTopic(topicsFor(map, id), …)` read "none" the
  // same way whether the claim was looked up and carries nothing or was never looked up at all.
  it('leaves out a claim carrying no topics rather than mapping it to an empty list', () => {
    const map = claimTopicsById([entity('claim-1', []), entity('claim-2', [{ topicId: 'topic-ai', name: 'AI' }])]);

    expect(topicsFor(map, 'claim-1')).toBeUndefined();
    expect(topicsFor(map, 'claim-2')).toEqual([ai]);
    expect(map.size).toBe(1);
  });

  /**
   * The keys are graph entity ids — bare hex — and every caller looks them up by the
   * `claim_entity_id` on a geo-chat row, which is a hyphenated UUID for the same claim. A raw `get`
   * across that boundary answers "no topics", and nothing about that reads as a failure: the claim
   * simply loses its labels, leaves the facet, and vanishes the moment a topic is picked.
   */
  it('answers for a geo-chat spelling of the same claim', () => {
    const map = claimTopicsById([entity('a1b2c3d4e5f6478899aabbccddeeff00', [{ topicId: 'topic-ai', name: 'AI' }])]);

    expect(topicsFor(map, 'a1b2c3d4-e5f6-4788-99aa-bbccddeeff00')).toEqual([ai]);
  });

  /**
   * Topics are assigned per space and a card is always drawn under one, so a topic the claim carries
   * in another space is not one it carries here. Shown anyway, it went into the facet beside the
   * card and picking it filtered the card in or out on something that is not true where the debate
   * would be published — the query side of this is what `relatedClaimsWhere` scopes.
   */
  it('answers only for the space the card is drawn under', () => {
    const map = claimTopicsById([
      {
        id: 'claim-1',
        relations: [
          { type: { id: TOPICS_PROPERTY_ID }, spaceId: 'space-here', toEntity: { id: 'topic-ai', name: 'AI' } },
          {
            type: { id: TOPICS_PROPERTY_ID },
            spaceId: 'space-elsewhere',
            toEntity: { id: 'topic-health', name: 'Health' },
          },
        ],
      },
    ]);

    expect(topicsFor(map, 'claim-1', 'space-here')).toEqual([ai]);
    expect(topicsFor(map, 'claim-1', 'space-elsewhere')).toEqual([health]);
    // No space asked about is no narrowing, which is what the facets do when they have none.
    expect(topicsFor(map, 'claim-1')).toEqual([ai, health]);
  });

  /**
   * Callers hand this several projections of the same pool and a claim can be in more than one. The
   * rematch picker appends its tagged catalog last, and that projection does not select relation
   * spaces — so a Debate-tagged claim also reached by id had its spaces replaced by a projection
   * that never asked for them, and the space filter went back to keeping everything.
   */
  it('keeps the spaces a second projection of the same claim never asked for', () => {
    const map = claimTopicsById([
      // The by-id projection, which knows where each topic was assigned.
      {
        id: 'claim-1',
        relations: [
          { type: { id: TOPICS_PROPERTY_ID }, spaceId: 'space-here', toEntity: { id: 'topic-ai', name: 'AI' } },
          {
            type: { id: TOPICS_PROPERTY_ID },
            spaceId: 'space-elsewhere',
            toEntity: { id: 'topic-health', name: 'Health' },
          },
        ],
      },
      // The tagged catalog, carrying the same claim with no spaces at all.
      entity('claim-1', [
        { topicId: 'topic-ai', name: 'AI' },
        { topicId: 'topic-health', name: 'Health' },
      ]),
    ]);

    expect(topicsFor(map, 'claim-1', 'space-here')).toEqual([ai]);
  });

  /**
   * Not every projection selects the relation's space — the tagged catalog does not — and an unknown
   * space cannot be compared to one. Dropping those would empty the facet for a whole source rather
   * than narrow it, which is a worse answer than a slightly wide one.
   */
  it('keeps a topic whose space it was never told', () => {
    const map = claimTopicsById([entity('claim-1', [{ topicId: 'topic-ai', name: 'AI' }])]);

    expect(topicsFor(map, 'claim-1', 'space-here')).toEqual([ai]);
  });

  it('carries an unnamed topic as null rather than dropping it', () => {
    const map = claimTopicsById([entity('claim-1', [{ topicId: 'topic-unnamed' }])]);

    expect(topicsFor(map, 'claim-1')).toEqual([unnamed]);
  });
});

describe('availableTopics', () => {
  it('offers only the topics carried by the claims it is given', () => {
    expect(availableTopics(['claim-in-crypto'], topicsByClaimId)).toEqual([ai]);
  });

  it('drops a topic once its claims are filtered out', () => {
    // The bug: filter to a space holding only the health claim and AI stayed on the menu,
    // where picking it could only ever produce an empty list.
    expect(availableTopics(['claim-in-health'], topicsByClaimId).map(topic => topic.id)).toEqual(['topic-health']);
  });

  it('deduplicates a topic carried by more than one claim', () => {
    expect(availableTopics(['claim-in-crypto', 'claim-in-both'], topicsByClaimId)).toEqual([ai, health]);
  });

  it('sorts by name and tolerates a topic without one', () => {
    expect(
      availableTopics(['claim-in-health', 'claim-unnamed-topic', 'claim-in-crypto'], topicsByClaimId).map(
        topic => topic.name
      )
    ).toEqual([null, 'AI', 'Health']);
  });

  it('is empty when the claims carry no topics', () => {
    expect(availableTopics(['claim-with-no-topics'], topicsByClaimId)).toEqual([]);
  });
});

describe('keepSelectableTopic', () => {
  it('keeps a selection the menu still offers', () => {
    expect(keepSelectableTopic('topic-ai', [ai, health], true)).toBe('topic-ai');
  });

  it('drops a selection the menu no longer offers', () => {
    expect(keepSelectableTopic('topic-ai', [health], true)).toBeNull();
  });

  it('drops a selection when the picked space turns out to have no topics at all', () => {
    // The case that "empty means still loading" got wrong: a space whose claims carry no
    // topics is a resolved answer, and leaving the topic held stranded the viewer on an
    // empty list with no chip in the menu to clear.
    expect(keepSelectableTopic('topic-ai', [], true)).toBeNull();
  });

  it('holds the selection while the topics are still unresolved', () => {
    // The Claims tab resolves topics a round trip behind its claims, so every filter change
    // has a moment with nothing resolved. Clearing then would discard a selection that is
    // about to be valid again.
    expect(keepSelectableTopic('topic-ai', [], false)).toBe('topic-ai');
    expect(keepSelectableTopic('topic-ai', [health], false)).toBe('topic-ai');
  });

  it('leaves an empty selection alone', () => {
    expect(keepSelectableTopic(null, [ai], true)).toBeNull();
  });
});

describe('keepSelectableTopics', () => {
  const AI = { id: 'ai', name: 'AI' };
  const HEALTH = { id: 'health', name: 'Health' };

  it('drops only the selections the menu no longer offers', () => {
    expect(keepSelectableTopics(['ai', 'health'], [AI], true)).toEqual(['ai']);
  });

  it('holds every selection while the menu is unresolved', () => {
    expect(keepSelectableTopics(['ai', 'health'], [], false)).toEqual(['ai', 'health']);
  });

  // Returned by identity when nothing is dropped, so feeding the result back into state can't
  // loop on a fresh array every render.
  it('returns the same array when everything is still offered', () => {
    const selected = ['ai', 'health'];
    expect(keepSelectableTopics(selected, [AI, HEALTH], true)).toBe(selected);
  });

  // The race the co-occurrence menu opens: the second pick lands against the first one's facet,
  // before the answer narrowing that facet has arrived. Giving back only the pick that didn't fit
  // beats discarding the one the viewer chose deliberately alongside it.
  it('gives back only the newest pick when the combination matches nothing', () => {
    expect(keepSelectableTopics(['ai', 'health'], [], true)).toEqual(['ai']);
  });

  // A single held topic has no earlier pick to fall back to, so an empty menu still clears it —
  // the space changing under a held topic, which is what this rule was written for.
  it('still clears a lone topic the menu no longer offers', () => {
    expect(keepSelectableTopics(['ai'], [], true)).toEqual([]);
  });

  // Each round asks about the shortened selection, so a genuinely expired one drains rather than
  // sticking at one topic forever.
  it('drains a stale selection one pick at a time', () => {
    expect(keepSelectableTopics(['ai', 'health', 'crypto'], [], true)).toEqual(['ai', 'health']);
    expect(keepSelectableTopics(['ai', 'health'], [], true)).toEqual(['ai']);
    expect(keepSelectableTopics(['ai'], [], true)).toEqual([]);
  });
});

describe('orderFacetOptions', () => {
  const options = [
    { id: 'a', count: 1 },
    { id: 'b', count: 9 },
    { id: 'c', count: 5 },
  ];

  it('orders by count, descending', () => {
    expect(orderFacetOptions(options, []).map(o => o.id)).toEqual(['b', 'c', 'a']);
  });

  // Otherwise ticking one re-sorts the list under the cursor, and the row just clicked moves
  // before the next click lands.
  it('holds selected options at the top, whatever their count', () => {
    expect(orderFacetOptions(options, ['a']).map(o => o.id)).toEqual(['a', 'b', 'c']);
  });

  // Selected rows are the ones being worked with, and their counts move on every tick — so
  // ordering them by count made the already-chosen ones jump around as another was added.
  it('holds selected options in the order they were picked, not by count', () => {
    const picked = [
      { id: 'a', count: 1 },
      { id: 'b', count: 9 },
      { id: 'c', count: 5 },
    ];
    expect(orderFacetOptions(picked, ['c', 'a']).map(o => o.id)).toEqual(['c', 'a', 'b']);
  });

  // And the order survives the counts moving underneath them, which is what a tick does.
  it('keeps that order when the counts change', () => {
    const before = orderFacetOptions(
      [
        { id: 'a', count: 1 },
        { id: 'b', count: 9 },
      ],
      ['b', 'a']
    ).map(o => o.id);
    const after = orderFacetOptions(
      [
        { id: 'a', count: 40 },
        { id: 'b', count: 2 },
      ],
      ['b', 'a']
    ).map(o => o.id);
    expect(before).toEqual(['b', 'a']);
    expect(after).toEqual(before);
  });

  it('keeps equal counts in a stable order rather than whatever order they arrived in', () => {
    const tied = [
      { id: 'z', count: 3 },
      { id: 'y', count: 3 },
    ];
    expect(orderFacetOptions(tied, []).map(o => o.id)).toEqual(['y', 'z']);
  });
});

describe('formatFacetCount', () => {
  it('shows small counts exactly', () => {
    expect(formatFacetCount(7)).toBe('7');
    expect(formatFacetCount(99)).toBe('99');
  });

  // A narrow panel sizes every row to the widest number in it.
  it('caps anything past two digits', () => {
    expect(formatFacetCount(100)).toBe('99+');
    expect(formatFacetCount(4210)).toBe('99+');
  });
});

describe('keepSelectedVisible', () => {
  const options = [{ id: 'a', name: 'A', count: 2 }];

  it('leaves options that were never selected absent', () => {
    expect(keepSelectedVisible(options, []).map(o => o.id)).toEqual(['a']);
  });

  // Without this the checkbox vanishes while the trigger goes on counting the selection, and the
  // only way to remove it is to clear every space.
  it('brings a selection that fell out of the facet back at zero', () => {
    const kept = keepSelectedVisible(options, ['a', 'b']);
    expect(kept.map(o => o.id)).toEqual(['a', 'b']);
    expect(kept.find(o => o.id === 'b')?.count).toBe(0);
  });

  it('returns the same array when nothing is missing', () => {
    expect(keepSelectedVisible(options, ['a'])).toBe(options);
  });
});

describe('carriesEveryTopic', () => {
  const topics = [{ id: 'ai' }, { id: 'energy' }];

  it('keeps everything when nothing is picked', () => {
    expect(carriesEveryTopic(undefined, [])).toBe(true);
    expect(carriesEveryTopic(topics, [])).toBe(true);
  });

  it('keeps a claim carrying the one picked topic', () => {
    expect(carriesEveryTopic(topics, ['ai'])).toBe(true);
  });

  // The case that separates AND from OR. Under the old union rule this claim matched either topic
  // alone and so matched both; under intersection it has to carry every one of them.
  it('needs every picked topic, not any of them', () => {
    expect(carriesEveryTopic(topics, ['ai', 'energy'])).toBe(true);
    expect(carriesEveryTopic([{ id: 'ai' }], ['ai', 'energy'])).toBe(false);
  });

  it('drops a claim with no topics as soon as one is picked', () => {
    expect(carriesEveryTopic(undefined, ['ai'])).toBe(false);
    expect(carriesEveryTopic([], ['ai'])).toBe(false);
  });
});
