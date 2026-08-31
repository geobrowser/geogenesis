import { Effect } from 'effect';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { getSpacesWhereMember } from '~/core/io/queries';
import { fetchEditorSpaceIds } from '~/core/io/subgraph/fetch-editor-space-ids';

import { getGovernanceHomeSpaceContext } from './governance-home-space-ids';

vi.mock('~/core/io/queries', () => ({ getSpacesWhereMember: vi.fn() }));
vi.mock('~/core/io/subgraph/fetch-editor-space-ids', () => ({ fetchEditorSpaceIds: vi.fn() }));

// `cache()` from react memoizes per-argument, so every case needs a distinct id or the second
// call would return the first's result and the assertion would pass for the wrong reason.
const VALID_SPACE_ID = '89bd89bf28ff8a0963faf92a8c905e20';
const OTHER_VALID_SPACE_ID = 'c9f267dcb0d270718c2a3c45a64afd32';
const WALLET_ADDRESS = '0x77b3b79b551d90bfcd7fa12f372ca31626d79dc0';

afterEach(() => {
  vi.mocked(getSpacesWhereMember).mockReset();
  vi.mocked(fetchEditorSpaceIds).mockReset();
});

describe('getGovernanceHomeSpaceContext', () => {
  /**
   * The bug this exists for (GEOGENESIS-48, 274 occurrences): `fetchProfile` puts the wallet
   * address in `Profile.spaceId` on every failure path, callers checked it for truthiness, and both
   * queries here take a GraphQL `UUID!` — so the address reached the API and 400'd.
   */
  it('does not query with a wallet address masquerading as a space id', async () => {
    const result = await getGovernanceHomeSpaceContext(WALLET_ADDRESS);

    expect(result).toEqual({ editorIds: [], myProposalSpaceIds: [] });
    expect(fetchEditorSpaceIds).not.toHaveBeenCalled();
    expect(getSpacesWhereMember).not.toHaveBeenCalled();
  });

  it('does not query with an empty id', async () => {
    const result = await getGovernanceHomeSpaceContext('');

    expect(result).toEqual({ editorIds: [], myProposalSpaceIds: [] });
    expect(getSpacesWhereMember).not.toHaveBeenCalled();
  });

  it('still queries and merges for a real space id', async () => {
    vi.mocked(fetchEditorSpaceIds).mockResolvedValue(['editor-space']);
    // The real function returns an Effect and the module runs it through `Effect.runPromise`, so
    // the mock has to be an Effect too — a bare Promise fails with "Not a valid effect".
    vi.mocked(getSpacesWhereMember).mockReturnValue(
      Effect.succeed([{ id: 'member-space' }, { id: VALID_SPACE_ID }]) as never
    );

    const result = await getGovernanceHomeSpaceContext(VALID_SPACE_ID);

    expect(fetchEditorSpaceIds).toHaveBeenCalledWith(VALID_SPACE_ID);
    expect(result.editorIds).toEqual(['editor-space']);
    // Own space filtered out, editor and member ids merged and deduped.
    expect(result.myProposalSpaceIds).toEqual(['editor-space', 'member-space']);
  });

  it('dedupes a space the user is both editor and member of', async () => {
    vi.mocked(fetchEditorSpaceIds).mockResolvedValue(['shared-space']);
    vi.mocked(getSpacesWhereMember).mockReturnValue(Effect.succeed([{ id: 'shared-space' }]) as never);

    const result = await getGovernanceHomeSpaceContext(OTHER_VALID_SPACE_ID);

    expect(result.myProposalSpaceIds).toEqual(['shared-space']);
  });
});
