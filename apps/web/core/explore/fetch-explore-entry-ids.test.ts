import { Effect } from 'effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DEBATE_CLAIMS_PROPERTY_ID, DEBATE_TYPE_ID } from '~/core/debates/ontology';

import { fetchExploreEntryIds } from './fetch-explore-entry-ids';

const mocks = vi.hoisted(() => ({ graph: vi.fn() }));
vi.mock('~/core/io/graphql-client', () => ({ graphql: mocks.graph }));

const ID = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const RELATED = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const SPACE = 'cccccccccccccccccccccccccccccccc';

beforeEach(() => {
  mocks.graph.mockReset();
});

describe('Explore entry candidate IDs', () => {
  it('scopes related debates to visible spaces and deduplicates the selected entity', async () => {
    mocks.graph.mockImplementation(({ decoder }) =>
      Effect.succeed(
        decoder({
          relationsConnection: {
            nodes: [{ fromEntityId: RELATED }, { fromEntityId: RELATED }, { fromEntityId: ID }, { fromEntityId: null }],
          },
        })
      )
    );
    expect(await fetchExploreEntryIds(ID, [SPACE])).toEqual([ID, RELATED]);
    expect(mocks.graph.mock.calls[0][0].variables).toEqual({
      id: ID,
      spaces: [SPACE],
      claimProperty: DEBATE_CLAIMS_PROPERTY_ID,
      debateType: DEBATE_TYPE_ID,
    });
  });

  it('retains the selected debate when it has no incoming claim relations', async () => {
    mocks.graph.mockImplementation(({ decoder }) => Effect.succeed(decoder({ relationsConnection: { nodes: [] } })));
    expect(await fetchExploreEntryIds(ID, [SPACE])).toEqual([ID]);
  });

  it('does not query unscoped relations when there are no visible spaces', async () => {
    expect(await fetchExploreEntryIds(ID, [])).toEqual([ID]);
    expect(mocks.graph).not.toHaveBeenCalled();
  });

  it('propagates a failed relation lookup instead of claiming the selection is missing', async () => {
    mocks.graph.mockReturnValue(Effect.fail(new Error('unavailable')));
    await expect(fetchExploreEntryIds(ID, [SPACE])).rejects.toThrow('unavailable');
  });
});
