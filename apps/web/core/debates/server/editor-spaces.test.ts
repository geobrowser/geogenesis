import { beforeEach, describe, expect, it, vi } from 'vitest';

import { listEditorSpaceIds } from './editor-spaces';

const request = vi.fn();

vi.mock('graphql-request', () => ({
  GraphQLClient: class {
    request = request;
  },
}));

vi.mock('~/core/environment/environment', () => ({
  getConfig: () => ({ api: 'https://testnet-api.geobrowser.io/graphql' }),
}));

/** One page of the editors connection, as the API returns it. */
function page(spaceIds: string[], endCursor: string | null = null, hasNextPage = false) {
  return {
    editorsConnection: { nodes: spaceIds.map(spaceId => ({ spaceId })), pageInfo: { hasNextPage, endCursor } },
  };
}

const MEMBER = '88883e1ec8261b8ac323f564e272b5be';
const [SPACE_A, SPACE_B, SPACE_C] = [
  '41e851610e13a19441c4d980f2f2ce6b',
  'c9f267dcb0d270718c2a3c45a64afd32',
  '224406e0de3c48d78ef12774111b8b2f',
];

describe('listEditorSpaceIds', () => {
  beforeEach(() => {
    request.mockReset();
  });

  // A `String!` variable against a UUID column is rejected by schema validation, which 500s the
  // sweep. The query is hand-written, so codegen can't catch that; assert the declared type here.
  it('declares memberSpaceId as UUID!, the column type', async () => {
    request.mockResolvedValue(page([]));
    await listEditorSpaceIds('88883e1ec8261b8ac323f564e272b5be');

    const [document] = request.mock.calls[0];
    expect(document).toContain('$memberSpaceId: UUID!');
    expect(document).not.toContain('String!');
  });

  it('normalizes a dashed space id before querying', async () => {
    request.mockResolvedValue(page([]));
    await listEditorSpaceIds('88883E1E-C826-1B8A-C323-F564E272B5BE');

    const [, variables] = request.mock.calls.at(-1)!;
    expect(variables).toMatchObject({ memberSpaceId: '88883e1ec8261b8ac323f564e272b5be' });
  });

  it('returns the deduped set of editor space ids', async () => {
    request.mockResolvedValue(page([SPACE_A, SPACE_B, SPACE_A]));

    await expect(listEditorSpaceIds(MEMBER)).resolves.toEqual([SPACE_A, SPACE_B]);
  });

  // The sweep finds its work here: a read that stopped at one page would leave every later space
  // unswept, silently.
  it('follows the cursor until the connection is exhausted', async () => {
    request
      .mockResolvedValueOnce(page([SPACE_A], 'c1', true))
      .mockResolvedValueOnce(page([SPACE_B], 'c2', true))
      .mockResolvedValueOnce(page([SPACE_C]));

    await expect(listEditorSpaceIds(MEMBER)).resolves.toEqual([SPACE_A, SPACE_B, SPACE_C]);
    expect(request.mock.calls.map(([, variables]) => variables.after)).toEqual([null, 'c1', 'c2']);
  });

  it('throws rather than return a partial list when the cursor chain breaks', async () => {
    request.mockResolvedValueOnce(page([SPACE_A], null, true));

    await expect(listEditorSpaceIds(MEMBER)).rejects.toThrow('next page but no end cursor');
  });

  it('retries a transient failure on a later page without restarting the walk', async () => {
    request
      .mockResolvedValueOnce(page([SPACE_A], 'c1', true))
      .mockRejectedValueOnce(Object.assign(new Error('503'), { response: { status: 503 } }))
      .mockResolvedValueOnce(page([SPACE_B]));

    await expect(listEditorSpaceIds(MEMBER)).resolves.toEqual([SPACE_A, SPACE_B]);
    expect(request.mock.calls.map(([, variables]) => variables.after)).toEqual([null, 'c1', 'c1']);
  });
});
