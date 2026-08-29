import { describe, expect, it } from 'vitest';

import type { MatchmakingTopic } from '~/core/debates/api';

import {
  availableTopics,
  carriesEveryTopic,
  formatFacetCount,
  keepSelectableTopic,
  keepSelectableTopics,
  keepSelectedVisible,
  orderFacetOptions,
} from './topic-facets';

const ai: MatchmakingTopic = { id: 'topic-ai', name: 'AI' };
const health: MatchmakingTopic = { id: 'topic-health', name: 'Health' };
const unnamed: MatchmakingTopic = { id: 'topic-unnamed', name: null };

const topicsByClaimId = new Map<string, MatchmakingTopic[]>([
  ['claim-in-crypto', [ai]],
  ['claim-in-health', [health]],
  ['claim-in-both', [ai, health]],
  ['claim-unnamed-topic', [unnamed]],
]);

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
