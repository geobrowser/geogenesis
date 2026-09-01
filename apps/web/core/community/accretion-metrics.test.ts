import { describe, expect, it } from 'vitest';

import { buildAccretionDashboard, classifyArtifactOperation, median } from './accretion-metrics';
import type { AccretionMetricInputs } from './accretion-types';

const NOW_SECONDS = Date.UTC(2026, 7, 29) / 1000;

function inputs(overrides: Partial<AccretionMetricInputs> = {}): AccretionMetricInputs {
  return {
    period: 'year',
    nowSeconds: NOW_SECONDS,
    bounties: [
      {
        id: 'bounty-1',
        name: 'Build claims',
        createdAt: NOW_SECONDS - 10_000,
        budget: 100,
        deadline: NOW_SECONDS + 10_000,
        status: 'Done',
        curatorIds: ['curator-1'],
        curatorNames: { 'curator-1': 'Ada' },
      },
    ],
    proposals: [
      {
        id: 'proposal-1',
        spaceId: 'space-1',
        bountyIds: ['bounty-1'],
        proposedBy: 'curator-1',
        proposedByName: 'Ada',
        createdAt: NOW_SECONDS - 8_000,
        executedAt: NOW_SECONDS - 5_000,
      },
    ],
    payouts: [
      {
        id: 'payout-1',
        bountyId: 'bounty-1',
        proposalIds: ['proposal-1'],
        amount: 100,
        createdAt: NOW_SECONDS - 4_000,
        recipientId: null,
        recipientName: null,
      },
    ],
    proposalOutputs: [
      {
        proposalId: 'proposal-1',
        artifacts: [
          {
            entityId: 'claim-1',
            typeId: 'claim-type',
            typeName: 'Claim',
            operation: 'created',
            weightedUnits: 1,
          },
        ],
      },
    ],
    diffProposalLimit: 24,
    diffLimitReached: false,
    sourceTruncated: false,
    ...overrides,
  };
}

describe('accretion metrics', () => {
  it('calculates medians for odd and even samples', () => {
    expect(median([9, 1, 5])).toBe(5);
    expect(median([10, 2, 8, 4])).toBe(6);
    expect(median([])).toBe(0);
  });

  it('classifies all-new diffs as created and existing edits as reused', () => {
    expect(
      classifyArtifactOperation({
        values: [{ before: null, after: 'A claim' }],
        relations: [{ before: null, after: { toEntityId: 'type' } }],
        blocks: [],
      })
    ).toBe('created');

    expect(
      classifyArtifactOperation({
        values: [{ before: 'Old', after: 'New' }],
        relations: [],
        blocks: [],
      })
    ).toBe('reused');
  });

  it('builds the six dashboard metrics without using them as payout inputs', () => {
    const result = buildAccretionDashboard(inputs());

    expect(result.summary).toMatchObject({
      bountiesPosted: 1,
      acceptedProposals: 1,
      payoutAmount: 100,
      modeledPayoutAmount: 100,
      acceptedArtifacts: 1,
      replacementValue: 100,
      retroactiveRoi: 1,
    });
    expect(result.unitCosts).toEqual([
      expect.objectContaining({ typeName: 'Claim', rawUnits: 1, proposalSamples: 1, medianUnitCost: 100 }),
    ]);
    expect(result.delivery.map(stage => stage.count)).toEqual([1, 1, 1, 1, 1, 1]);
    expect(result.curatorCohorts[0]).toMatchObject({
      curatorId: 'curator-1',
      name: 'Ada',
      payoutAmount: 100,
      outputUnits: 1,
      efficiency: 1,
      inferred: true,
    });
    expect(result.duplication).toMatchObject({ native: 1, reused: 0, unknown: 0 });
  });

  it('allocates one payout across multiple proposals without double counting spend', () => {
    const base = inputs();
    const result = buildAccretionDashboard(
      inputs({
        proposals: [
          ...base.proposals,
          {
            id: 'proposal-2',
            spaceId: 'space-1',
            bountyIds: ['bounty-1'],
            proposedBy: 'curator-1',
            proposedByName: 'Ada',
            createdAt: NOW_SECONDS - 7_000,
            executedAt: NOW_SECONDS - 4_500,
          },
        ],
        payouts: [{ ...base.payouts[0], proposalIds: ['proposal-1', 'proposal-2'] }],
        proposalOutputs: [
          ...base.proposalOutputs,
          {
            proposalId: 'proposal-2',
            artifacts: [
              {
                entityId: 'claim-2',
                typeId: 'claim-type',
                typeName: 'Claim',
                operation: 'created',
                weightedUnits: 1,
              },
            ],
          },
        ],
      })
    );

    expect(result.summary.payoutAmount).toBe(100);
    expect(result.unitCosts[0]).toMatchObject({ medianUnitCost: 50, modeledSpend: 100 });
    expect(result.summary.replacementValue).toBe(100);
    expect(result.summary.retroactiveRoi).toBe(1);
  });

  it('excludes partially classified payout bundles from unit-cost estimates', () => {
    const base = inputs();
    const result = buildAccretionDashboard(
      inputs({
        proposals: [
          ...base.proposals,
          {
            id: 'proposal-2',
            spaceId: 'space-1',
            bountyIds: ['bounty-1'],
            proposedBy: 'curator-1',
            proposedByName: 'Ada',
            createdAt: NOW_SECONDS - 7_000,
            executedAt: NOW_SECONDS - 4_500,
          },
        ],
        payouts: [{ ...base.payouts[0], proposalIds: ['proposal-1', 'proposal-2'] }],
      })
    );

    expect(result.unitCosts).toEqual([]);
    expect(result.summary.retroactiveRoi).toBeNull();
    expect(result.duplication.unclassifiedProposals).toBe(1);
  });
});
