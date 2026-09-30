import { describe, expect, it, vi } from 'vitest';

// The decoder is pure; the hook's own imports reach the network and geo-chat auth, which the decoder
// never touches.
vi.mock('~/core/debates/hooks', () => ({ useDebate: vi.fn() }));
vi.mock('./use-debates-best-order', () => ({ useDebatesBestOrder: vi.fn() }));

const { decodeNextDebateCandidates } = await import('./use-next-debate');

describe('decodeNextDebateCandidates', () => {
  it("reads each debate's claim, the claim's topics and the video's key frame", () => {
    const candidates = decodeNextDebateCandidates({
      entitiesConnection: {
        nodes: [
          {
            id: 'DEBATE-1',
            claims: [
              {
                toEntity: {
                  id: 'CLAIM-1',
                  name: 'We should slow down AI development',
                  topics: [{ toEntityId: 'TOPIC-1' }, { toEntityId: null }],
                },
              },
            ],
            videos: [
              {
                toEntity: {
                  keyFrames: [{ toEntity: { valuesList: [{ text: 'Debate keyframe' }, { text: 'ipfs://frame' }] } }],
                },
              },
            ],
          },
        ],
      },
    });

    expect(candidates).toEqual([
      {
        debateId: 'debate1',
        claimId: 'claim1',
        claimName: 'We should slow down AI development',
        topicIds: ['topic1'],
        // The image's name is a value too; only a loadable URL is a key frame.
        keyFrame: 'ipfs://frame',
      },
    ]);
  });

  it('drops a debate with no named claim, which the card would have nothing to title with', () => {
    const candidates = decodeNextDebateCandidates({
      entitiesConnection: {
        nodes: [
          { id: 'no-claim', claims: [], videos: [] },
          { id: 'unnamed', claims: [{ toEntity: { id: 'claim', name: null } }], videos: [] },
          null,
        ],
      },
    });

    expect(candidates).toEqual([]);
  });

  it('offers a debate with no key frame, just without a thumbnail', () => {
    const [candidate] = decodeNextDebateCandidates({
      entitiesConnection: {
        nodes: [{ id: 'debate', claims: [{ toEntity: { id: 'claim', name: 'A claim' } }], videos: [] }],
      },
    });

    expect(candidate).toMatchObject({ debateId: 'debate', keyFrame: null, topicIds: [] });
  });
});
