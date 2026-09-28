import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { EntityDiff } from '~/core/utils/diff';

import { fetchRankingPendingEntities } from './fetch-ranking-pending-proposals';

const fetchProposalsByUserMock = vi.fn();
const fetchProposalDiffsMock = vi.fn();

vi.mock('~/core/io/fetch-proposals-by-user', () => ({
  fetchProposalsByUser: (...args: unknown[]) => fetchProposalsByUserMock(...args),
}));

vi.mock('~/core/io/subgraph/fetch-proposal-diffs', () => ({
  fetchProposalDiffs: (...args: unknown[]) => fetchProposalDiffsMock(...args),
}));

const SPACE_ID = 'a'.repeat(32);

function hexId(n: number): string {
  return n.toString(16).padStart(32, '0');
}

function proposal(n: number, overrides: Partial<{ name: string | null; status: string; type: string }> = {}) {
  return {
    id: hexId(1000 + n),
    name: `Best pizza - Create new - Entity ${n}`,
    status: 'PROPOSED',
    type: 'ADD_EDIT',
    space: { id: SPACE_ID },
    ...overrides,
  };
}

function entityDiff(entityId: string, name: string): EntityDiff {
  return {
    entityId,
    name: null,
    values: [
      {
        propertyId: SystemIds.NAME_PROPERTY,
        spaceId: SPACE_ID,
        type: 'TEXT',
        before: null,
        after: name,
        diff: [],
      },
    ],
    relations: [],
    blocks: [],
  };
}

describe('fetchRankingPendingEntities', () => {
  beforeEach(() => {
    fetchProposalsByUserMock.mockReset();
    fetchProposalDiffsMock.mockReset();
  });

  it('diffs only open "Create new" proposals, raw, without profiles', async () => {
    const wanted = hexId(1);
    const signal = new AbortController().signal;
    fetchProposalsByUserMock.mockResolvedValue([
      proposal(1),
      proposal(2, { name: 'Edit description' }),
      proposal(3, { name: null }),
      proposal(4, { status: 'ACCEPTED' }),
      proposal(5, { type: 'ADD_SUBSPACE' }),
    ]);
    fetchProposalDiffsMock.mockResolvedValue({ status: 'success', entities: [entityDiff(wanted, 'Joe’s Pizza')] });

    const result = await fetchRankingPendingEntities({
      spaceId: SPACE_ID,
      unresolvedEntityIds: [wanted],
      proposerSpaceIds: ['me'],
      signal,
    });

    expect(fetchProposalsByUserMock).toHaveBeenCalledWith(
      expect.objectContaining({ proposerSpaceId: 'me', includeProfiles: false, signal })
    );
    expect(fetchProposalDiffsMock).toHaveBeenCalledTimes(1);
    expect(fetchProposalDiffsMock).toHaveBeenCalledWith(proposal(1).id, SPACE_ID, { postProcess: false, signal });
    expect([...result.pendingEntityIds]).toEqual([wanted]);
    expect(result.entriesByEntityId.get(wanted)?.name).toBe('Joe’s Pizza');
  });

  it('stops paging once every wanted id is found', async () => {
    const wanted = hexId(1);
    fetchProposalsByUserMock.mockResolvedValue([1, 2, 3, 4, 5].map(n => proposal(n)));
    fetchProposalDiffsMock.mockResolvedValue({ status: 'success', entities: [entityDiff(wanted, 'Found')] });

    await fetchRankingPendingEntities({ spaceId: SPACE_ID, unresolvedEntityIds: [wanted], proposerSpaceIds: ['me'] });

    // A full page (5) would normally continue to page 1; the found id ends the scan.
    expect(fetchProposalsByUserMock).toHaveBeenCalledTimes(1);
  });

  it('caps the total number of diffs across proposers and pages', async () => {
    let next = 0;
    fetchProposalsByUserMock.mockImplementation(async () => [1, 2, 3, 4, 5].map(() => proposal(next++)));
    fetchProposalDiffsMock.mockResolvedValue({ status: 'success', entities: [] });

    await fetchRankingPendingEntities({
      spaceId: SPACE_ID,
      unresolvedEntityIds: [hexId(999)],
      proposerSpaceIds: ['a', 'b', 'c', 'd'],
    });

    expect(fetchProposalDiffsMock).toHaveBeenCalledTimes(10);
  });

  it('skips fetching when there is nothing to resolve or nobody to ask', async () => {
    await fetchRankingPendingEntities({ spaceId: SPACE_ID, unresolvedEntityIds: [], proposerSpaceIds: ['me'] });
    await fetchRankingPendingEntities({ spaceId: SPACE_ID, unresolvedEntityIds: [hexId(1)], proposerSpaceIds: [] });

    expect(fetchProposalsByUserMock).not.toHaveBeenCalled();
    expect(fetchProposalDiffsMock).not.toHaveBeenCalled();
  });
});
