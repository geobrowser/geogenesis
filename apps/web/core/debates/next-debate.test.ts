import { describe, expect, it } from 'vitest';

import type { Entity } from '~/core/types';
import { normId } from '~/core/utils/norm-id';

import { type NextDebateCandidate, debateClaimIds, nextDebateCandidates, pickNextDebate } from './next-debate';

const CURRENT_DEBATE = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const CURRENT_CLAIM = 'cccccccccccccccccccccccccccccccc';

const candidate = (debateId: string, claimId: string, topicIds: string[] = []): NextDebateCandidate => ({
  debateId,
  claimId,
  claimName: `Claim ${claimId}`,
  topicIds,
});

const current = candidate(CURRENT_DEBATE, CURRENT_CLAIM, ['ai-safety', 'ai-policy']);

function pick({
  candidates,
  ranking = [],
  watched = [],
}: {
  candidates: NextDebateCandidate[];
  ranking?: string[];
  watched?: string[];
}) {
  return pickNextDebate({
    candidates,
    // geo-chat spells the debate and claim ids as dashed uuids; the graph as bare hex.
    currentDebateId: 'AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA',
    currentClaimId: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
    // Normalized, as `useDebatesBestOrder` and `readWatchedDebateIds` both key them.
    rankByDebateId: new Map(ranking.map((id, index) => [normId(id), index])),
    watchedDebateIds: new Set(watched.map(normId)),
  });
}

describe('pickNextDebate', () => {
  it('prefers a debate on a related claim over a better-ranked unrelated one', () => {
    const result = pick({
      candidates: [
        current,
        candidate('unrelated', 'claim-u', ['sport']),
        candidate('related', 'claim-r', ['ai-policy']),
      ],
      ranking: ['unrelated', 'related'],
    });

    expect(result).toEqual({ candidate: expect.objectContaining({ debateId: 'related' }), related: true });
  });

  it('takes the best-ranked of several related debates', () => {
    const result = pick({
      candidates: [
        current,
        candidate('related-low', 'claim-1', ['ai-safety']),
        candidate('related-high', 'claim-2', ['ai-policy']),
      ],
      ranking: ['related-high', 'related-low'],
    });

    expect(result?.candidate.debateId).toBe('related-high');
  });

  it('falls back to the best-ranked debate in the space, and says it is not related', () => {
    const result = pick({
      candidates: [current, candidate('second', 'claim-2', ['sport']), candidate('first', 'claim-1', [])],
      ranking: ['first', 'second'],
    });

    expect(result).toEqual({ candidate: expect.objectContaining({ debateId: 'first' }), related: false });
  });

  it('skips debates this browser has watched, falling through to the next one', () => {
    const result = pick({
      candidates: [current, candidate('seen', 'claim-1', ['ai-safety']), candidate('fresh', 'claim-2', ['ai-safety'])],
      ranking: ['seen', 'fresh'],
      watched: ['seen'],
    });

    expect(result?.candidate.debateId).toBe('fresh');
  });

  it('skips another debate on the claim that was just debated', () => {
    const result = pick({
      candidates: [current, candidate('rematch', CURRENT_CLAIM, ['ai-safety']), candidate('other', 'claim-2', [])],
      ranking: ['rematch', 'other'],
    });

    expect(result).toEqual({ candidate: expect.objectContaining({ debateId: 'other' }), related: false });
  });

  it('never offers the debate that just ended, even when it ranks first', () => {
    const result = pick({ candidates: [current, candidate('other', 'claim-2')], ranking: [CURRENT_DEBATE, 'other'] });

    expect(result?.candidate.debateId).toBe('other');
  });

  it('puts debates the ranking has not covered after every ranked one, in the order they came', () => {
    const result = pick({
      candidates: [
        current,
        candidate('unranked-1', 'claim-1'),
        candidate('unranked-2', 'claim-2'),
        candidate('ranked', 'claim-3'),
      ],
      ranking: ['ranked'],
    });
    expect(result?.candidate.debateId).toBe('ranked');

    const noRanking = pick({
      candidates: [current, candidate('unranked-1', 'claim-1'), candidate('unranked-2', 'claim-2')],
    });
    expect(noRanking?.candidate.debateId).toBe('unranked-1');
  });

  it('treats nothing as related when the current debate is not among the candidates yet', () => {
    const result = pick({ candidates: [candidate('other', 'claim-2', ['ai-safety'])] });

    expect(result).toEqual({ candidate: expect.objectContaining({ debateId: 'other' }), related: false });
  });

  it('suggests nothing once every other debate in the space has been watched', () => {
    expect(pick({ candidates: [current, candidate('seen', 'claim-1', ['ai-safety'])], watched: ['seen'] })).toBeNull();
  });
});

describe('nextDebateCandidates', () => {
  const SPACE = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const ELSEWHERE = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
  const CLAIMS = 'e614cce1c4ce45868304fd1237119eb2';
  const VIDEOS = 'c48dc314fa7148aeb967139160456f1d';
  const TOPICS = '806d52bc27e94c9193c057978b093351';

  const relation = (typeId: string, toId: string, spaceId = SPACE) => ({
    type: { id: typeId },
    toEntity: { id: toId },
    spaceId,
  });
  // `name` mirrored into a value in this space, which is where the space-aware name is read from.
  const entity = (id: string, relations: ReturnType<typeof relation>[], name: string | null = null) =>
    ({
      id,
      name,
      relations,
      values: name ? [{ property: { id: 'a126ca530c8e48d5b88882c734c38935' }, spaceId: SPACE, value: name }] : [],
    }) as unknown as Entity;

  const debate = (id: string, claimId: string, extra: ReturnType<typeof relation>[] = []) =>
    entity(id, [relation(CLAIMS, claimId), relation(VIDEOS, `video-${id}`), ...extra]);

  it("reads each debate's claim, and the claim's topics in this space only", () => {
    const debates = [debate('d1', 'c1')];
    const claims = [
      entity('c1', [relation(TOPICS, 'topic-here'), relation(TOPICS, 'topic-elsewhere', ELSEWHERE)], 'A claim'),
    ];

    expect(debateClaimIds(debates, SPACE)).toEqual(['c1']);
    expect(nextDebateCandidates(debates, claims, SPACE)).toEqual([
      { debateId: 'd1', claimId: 'c1', claimName: 'A claim', topicIds: ['topichere'] },
    ]);
  });

  it("names the claim in this space's wording, not the graph's merged name", () => {
    const NAME = 'a126ca530c8e48d5b88882c734c38935';
    const nameIn = (spaceId: string, value: string) => ({ property: { id: NAME }, spaceId, value });
    const claim = {
      ...entity('c1', [], 'Wording from elsewhere'),
      values: [nameIn(ELSEWHERE, 'Wording from elsewhere'), nameIn(SPACE, 'Wording in this space')],
    } as unknown as Entity;

    expect(nextDebateCandidates([debate('d1', 'c1')], [claim], SPACE)[0]?.claimName).toBe('Wording in this space');
  });

  it('drops a debate with no video, which there would be nothing to watch on', () => {
    const noVideo = entity('d1', [relation(CLAIMS, 'c1')]);
    expect(nextDebateCandidates([noVideo], [entity('c1', [], 'A claim')], SPACE)).toEqual([]);
  });

  it("ignores a debate's relations published in another space", () => {
    const foreign = entity('d1', [relation(CLAIMS, 'c1', ELSEWHERE), relation(VIDEOS, 'v1', ELSEWHERE)]);
    expect(debateClaimIds([foreign], SPACE)).toEqual([]);
  });

  it('drops a debate whose claim has no name yet, which the card could not title', () => {
    expect(nextDebateCandidates([debate('d1', 'c1')], [entity('c1', [])], SPACE)).toEqual([]);
    expect(nextDebateCandidates([debate('d1', 'c1')], [], SPACE)).toEqual([]);
  });
});
