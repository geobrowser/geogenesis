import { describe, expect, it } from 'vitest';

import type { MatchmakingTopic } from '~/core/debates/api';

import { availableTopics, keepSelectableTopic } from './topic-facets';

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
