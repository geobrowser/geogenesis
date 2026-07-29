import { describe, expect, it, vi } from 'vitest';

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

describe('listEditorSpaceIds', () => {
  // A `String!` variable against a UUID column is rejected by schema validation, which 500s the
  // sweep. The query is hand-written, so codegen can't catch that; assert the declared type here.
  it('declares memberSpaceId as UUID!, the column type', async () => {
    request.mockResolvedValue({ editors: [] });
    await listEditorSpaceIds('88883e1ec8261b8ac323f564e272b5be');

    const [document] = request.mock.calls[0];
    expect(document).toContain('$memberSpaceId: UUID!');
    expect(document).not.toContain('String!');
  });

  it('normalizes a dashed space id before querying', async () => {
    request.mockResolvedValue({ editors: [] });
    await listEditorSpaceIds('88883E1E-C826-1B8A-C323-F564E272B5BE');

    const [, variables] = request.mock.calls.at(-1)!;
    expect(variables).toEqual({ memberSpaceId: '88883e1ec8261b8ac323f564e272b5be' });
  });

  it('returns the deduped set of editor space ids', async () => {
    request.mockResolvedValue({
      editors: [
        { spaceId: '41e851610e13a19441c4d980f2f2ce6b' },
        { spaceId: 'c9f267dcb0d270718c2a3c45a64afd32' },
        { spaceId: '41e851610e13a19441c4d980f2f2ce6b' },
      ],
    });

    await expect(listEditorSpaceIds('88883e1ec8261b8ac323f564e272b5be')).resolves.toEqual([
      '41e851610e13a19441c4d980f2f2ce6b',
      'c9f267dcb0d270718c2a3c45a64afd32',
    ]);
  });
});
