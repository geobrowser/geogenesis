import { Effect } from 'effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DEBATE_CLAIMS_PROPERTY_ID } from '~/core/debates/ontology';
import { DEBATE_OPPOSED_BY_PROPERTY, DEBATE_SUPPORTED_BY_PROPERTY } from '~/core/profile/history-ontology';

import { fetchPairDebatedClaims, pairDebatedClaimsQueryKey } from './fetch-pair-debated-claims';

const graphqlMock = vi.fn();

vi.mock('~/core/environment', () => ({
  Environment: {
    getConfig: () => ({ api: 'https://example.com/graphql', bundler: '', chainId: '19411', rpc: '' }),
  },
}));

vi.mock('./graphql', () => ({
  graphql: (...args: unknown[]) => graphqlMock(...args),
}));

const VIEWER = '59be42b5561f44bca48ac5b665f3ae46';
const OPPONENT = '3dfbd32cc3024eeaab327159201dfe32';
const SOMEONE_ELSE = '8a4955bcd9d0fc0d8613f17f01de3b9f';

/** A debate as the query returns it: both sides and the claim it argued. */
function debate(id: string, supportedBy: string, opposedBy: string, claimId: string) {
  return {
    fromEntity: {
      id,
      relationsList: [
        { typeId: DEBATE_SUPPORTED_BY_PROPERTY, toEntityId: supportedBy },
        { typeId: DEBATE_OPPOSED_BY_PROPERTY, toEntityId: opposedBy },
        { typeId: DEBATE_CLAIMS_PROPERTY_ID, toEntityId: claimId },
      ],
    },
  };
}

function answer(nodes: unknown[]) {
  graphqlMock.mockReturnValue(Effect.succeed({ debates: { nodes } }));
}

function sentQuery(): string {
  return (graphqlMock.mock.calls[0]?.[0] as { query: string }).query;
}

describe('fetchPairDebatedClaims', () => {
  beforeEach(() => graphqlMock.mockReset());

  it('keeps the claims of debates against this opponent, on either side', async () => {
    answer([
      debate('d1', VIEWER, OPPONENT, 'claim-a'),
      debate('d2', OPPONENT, VIEWER, 'claim-b'),
      debate('d3', VIEWER, SOMEONE_ELSE, 'claim-c'),
    ]);

    await expect(fetchPairDebatedClaims(VIEWER, OPPONENT)).resolves.toEqual(['claima', 'claimb']);
  });

  /**
   * geo-chat hands out hyphenated ids and the graph's UUID filter matches only bare hex, answering
   * an empty list rather than an error for the other spelling.
   */
  it('asks about the viewer in bare hex, whatever spelling it was given', async () => {
    answer([]);

    await fetchPairDebatedClaims('59be42b5-561f-44bc-a48a-c665f3ae46aa', OPPONENT);

    expect(sentQuery()).toContain('toEntityId: { is: "59be42b5561f44bca48ac665f3ae46aa"');
  });

  it('matches the opponent under either spelling of their id', async () => {
    answer([debate('d1', VIEWER, OPPONENT, 'claim-a')]);

    await expect(fetchPairDebatedClaims(VIEWER, '3dfbd32c-c302-4eea-ab32-7159201dfe32')).resolves.toEqual(['claima']);
  });

  it('counts a debate once when it arrives once per side relation', async () => {
    const twice = debate('d1', VIEWER, OPPONENT, 'claim-a');
    answer([twice, twice]);

    await expect(fetchPairDebatedClaims(VIEWER, OPPONENT)).resolves.toEqual(['claima']);
  });

  it('fails loudly rather than answering "nothing debated"', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    graphqlMock.mockReturnValue(Effect.fail(new Error('down')));

    await expect(fetchPairDebatedClaims(VIEWER, OPPONENT)).rejects.toThrow('Failed to fetch debated claims for pair');
  });
});

describe('pairDebatedClaimsQueryKey', () => {
  it('is the same whichever participant asks', () => {
    expect(pairDebatedClaimsQueryKey(VIEWER, OPPONENT)).toEqual(pairDebatedClaimsQueryKey(OPPONENT, VIEWER));
  });
});
