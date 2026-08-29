import type {
  AccretionArtifact,
  AccretionArtifactOperation,
  AccretionBountyInput,
  AccretionCuratorCohort,
  AccretionDashboardResult,
  AccretionMetricInputs,
  AccretionPeriod,
  AccretionProposalInput,
  AccretionTimelinePoint,
  AccretionUnitCostRow,
} from './accretion-types';

const DAY_SECONDS = 24 * 60 * 60;

const PERIOD_DAYS: Record<Exclude<AccretionPeriod, 'all'>, number> = {
  week: 7,
  month: 30,
  year: 365,
};

export function accretionPeriodStart(period: AccretionPeriod, nowSeconds: number): number | null {
  return period === 'all' ? null : nowSeconds - PERIOD_DAYS[period] * DAY_SECONDS;
}

function isInPeriod(timestamp: number | null, start: number | null): boolean {
  return timestamp !== null && (start === null || timestamp >= start);
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

type DiffLike = {
  values: readonly { readonly before: string | null; readonly after: string | null }[];
  relations: readonly { readonly before?: unknown | null; readonly after?: unknown | null }[];
  blocks: readonly { readonly before: string | null; readonly after: string | null }[];
};

export function classifyArtifactOperation(diff: DiffLike): AccretionArtifactOperation {
  const changes = [
    ...diff.values.map(value => ({ before: value.before, after: value.after })),
    ...diff.relations.map(relation => ({ before: relation.before ?? null, after: relation.after ?? null })),
    ...diff.blocks.map(block => ({ before: block.before, after: block.after })),
  ];

  if (changes.length === 0) return 'unknown';
  return changes.every(change => change.before == null && change.after != null) ? 'created' : 'reused';
}

type TypeAccumulator = {
  typeId: string | null;
  typeName: string;
  rawUnits: number;
  weightedUnits: number;
  observations: number[];
  modeledSpend: number;
  proposalIds: Set<string>;
};

function artifactKey(artifact: AccretionArtifact): string {
  return artifact.typeId ?? `name:${artifact.typeName}`;
}

function buildUnitCosts(
  payouts: AccretionMetricInputs['payouts'],
  proposalById: Map<string, AccretionProposalInput>,
  outputByProposalId: Map<string, AccretionMetricInputs['proposalOutputs'][number]>
): AccretionUnitCostRow[] {
  const byType = new Map<string, TypeAccumulator>();

  for (const payout of payouts) {
    if (payout.amount === null || payout.amount < 0) continue;

    const acceptedProposalIds = [...new Set(payout.proposalIds)].filter(
      proposalId => proposalById.get(proposalId)?.executedAt != null
    );
    if (acceptedProposalIds.length === 0) continue;

    const outputs = acceptedProposalIds.map(proposalId => outputByProposalId.get(proposalId));
    if (outputs.some(output => !output || output.artifacts.length === 0)) continue;

    const proposalShare = payout.amount / acceptedProposalIds.length;

    for (const output of outputs) {
      if (!output) continue;
      const totalWeightedUnits = output.artifacts.reduce((sum, artifact) => sum + artifact.weightedUnits, 0);
      if (totalWeightedUnits <= 0) continue;

      const artifactGroups = new Map<string, AccretionArtifact[]>();
      for (const artifact of output.artifacts) {
        const key = artifactKey(artifact);
        const group = artifactGroups.get(key) ?? [];
        group.push(artifact);
        artifactGroups.set(key, group);
      }

      for (const [key, artifacts] of artifactGroups) {
        const weightedUnits = artifacts.reduce((sum, artifact) => sum + artifact.weightedUnits, 0);
        const allocatedSpend = proposalShare * (weightedUnits / totalWeightedUnits);
        const unitCost = weightedUnits > 0 ? allocatedSpend / weightedUnits : 0;
        const first = artifacts[0];
        const accumulator = byType.get(key) ?? {
          typeId: first.typeId,
          typeName: first.typeName,
          rawUnits: 0,
          weightedUnits: 0,
          observations: [],
          modeledSpend: 0,
          proposalIds: new Set<string>(),
        };

        accumulator.rawUnits += artifacts.length;
        accumulator.weightedUnits += weightedUnits;
        accumulator.observations.push(unitCost);
        accumulator.modeledSpend += allocatedSpend;
        accumulator.proposalIds.add(output.proposalId);
        byType.set(key, accumulator);
      }
    }
  }

  return [...byType.values()]
    .map(row => ({
      typeId: row.typeId,
      typeName: row.typeName,
      rawUnits: row.rawUnits,
      weightedUnits: row.weightedUnits,
      proposalSamples: row.proposalIds.size,
      medianUnitCost: median(row.observations),
      modeledSpend: row.modeledSpend,
    }))
    .sort((a, b) => b.weightedUnits - a.weightedUnits || a.typeName.localeCompare(b.typeName));
}

function bucketFor(timestamp: number, period: AccretionPeriod): { key: string; label: string } {
  const date = new Date(timestamp * 1000);

  if (period === 'week') {
    return {
      key: date.toISOString().slice(0, 10),
      label: new Intl.DateTimeFormat('en', { weekday: 'short', timeZone: 'UTC' }).format(date),
    };
  }

  if (period === 'month') {
    const day = date.getUTCDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    date.setUTCDate(date.getUTCDate() + mondayOffset);
    return {
      key: date.toISOString().slice(0, 10),
      label: new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(date),
    };
  }

  return {
    key: date.toISOString().slice(0, 7),
    label: new Intl.DateTimeFormat('en', { month: 'short', year: '2-digit', timeZone: 'UTC' }).format(date),
  };
}

function buildTimeline(
  period: AccretionPeriod,
  bounties: AccretionBountyInput[],
  proposals: AccretionProposalInput[],
  payouts: AccretionMetricInputs['payouts'],
  start: number | null
): AccretionTimelinePoint[] {
  type MutablePoint = AccretionTimelinePoint & { deliveredBountyIds: Set<string> };
  const points = new Map<string, MutablePoint>();

  const pointAt = (timestamp: number) => {
    const bucket = bucketFor(timestamp, period);
    const existing = points.get(bucket.key);
    if (existing) return existing;
    const point: MutablePoint = {
      ...bucket,
      bountiesPosted: 0,
      bountiesDelivered: 0,
      payoutAmount: 0,
      deliveredBountyIds: new Set<string>(),
    };
    points.set(bucket.key, point);
    return point;
  };

  for (const bounty of bounties) {
    if (isInPeriod(bounty.createdAt, start)) pointAt(bounty.createdAt as number).bountiesPosted += 1;
  }

  for (const proposal of proposals) {
    if (!isInPeriod(proposal.executedAt, start)) continue;
    const point = pointAt(proposal.executedAt as number);
    proposal.bountyIds.forEach(id => point.deliveredBountyIds.add(id));
  }

  for (const payout of payouts) {
    if (!isInPeriod(payout.createdAt, start) || payout.amount === null) continue;
    pointAt(payout.createdAt as number).payoutAmount += payout.amount;
  }

  return [...points.values()]
    .sort((a, b) => a.key.localeCompare(b.key))
    .slice(-12)
    .map(({ deliveredBountyIds, ...point }) => ({
      ...point,
      bountiesDelivered: deliveredBountyIds.size,
    }));
}

function resolveCurator(
  payout: AccretionMetricInputs['payouts'][number],
  bountyById: Map<string, AccretionBountyInput>,
  proposalById: Map<string, AccretionProposalInput>
): { id: string; name: string; inferred: boolean } {
  if (payout.recipientId) {
    return { id: payout.recipientId, name: payout.recipientName ?? 'Unnamed curator', inferred: false };
  }

  const bounty = payout.bountyId ? bountyById.get(payout.bountyId) : null;
  if (bounty?.curatorIds.length === 1) {
    const id = bounty.curatorIds[0];
    return { id, name: bounty.curatorNames[id] ?? 'Unnamed curator', inferred: true };
  }

  const authors = [
    ...new Set(
      payout.proposalIds.map(id => proposalById.get(id)?.proposedBy).filter((id): id is string => Boolean(id))
    ),
  ];
  if (authors.length === 1) {
    const proposal = payout.proposalIds.map(id => proposalById.get(id)).find(value => value?.proposedBy === authors[0]);
    return {
      id: authors[0],
      name: proposal?.proposedByName ?? `Curator ${authors[0].slice(0, 6)}`,
      inferred: true,
    };
  }

  return { id: 'unattributed', name: 'Unattributed', inferred: true };
}

function buildCuratorCohorts(
  payouts: AccretionMetricInputs['payouts'],
  bountyById: Map<string, AccretionBountyInput>,
  proposalById: Map<string, AccretionProposalInput>,
  outputByProposalId: Map<string, AccretionMetricInputs['proposalOutputs'][number]>,
  unitCostByType: Map<string, number>
): AccretionCuratorCohort[] {
  const cohorts = new Map<string, Omit<AccretionCuratorCohort, 'efficiency'>>();
  const payoutCountByProposal = new Map<string, number>();

  payouts.forEach(payout => {
    new Set(payout.proposalIds).forEach(proposalId =>
      payoutCountByProposal.set(proposalId, (payoutCountByProposal.get(proposalId) ?? 0) + 1)
    );
  });

  for (const payout of payouts) {
    if (payout.amount === null) continue;
    const curator = resolveCurator(payout, bountyById, proposalById);
    const existing = cohorts.get(curator.id) ?? {
      curatorId: curator.id,
      name: curator.name,
      payoutAmount: 0,
      outputUnits: 0,
      replacementValue: 0,
      inferred: curator.inferred,
    };
    existing.payoutAmount += payout.amount;
    existing.inferred ||= curator.inferred;

    for (const proposalId of new Set(payout.proposalIds)) {
      const output = outputByProposalId.get(proposalId);
      if (!output) continue;
      const divisor = payoutCountByProposal.get(proposalId) ?? 1;
      for (const artifact of output.artifacts) {
        const allocatedUnits = artifact.weightedUnits / divisor;
        existing.outputUnits += allocatedUnits;
        existing.replacementValue += (unitCostByType.get(artifactKey(artifact)) ?? 0) * allocatedUnits;
      }
    }

    cohorts.set(curator.id, existing);
  }

  return [...cohorts.values()]
    .map(row => ({
      ...row,
      efficiency: row.payoutAmount > 0 ? row.replacementValue / row.payoutAmount : null,
    }))
    .sort((a, b) => b.payoutAmount - a.payoutAmount)
    .slice(0, 8);
}

function uniqueBountyIds(proposals: AccretionProposalInput[], acceptedOnly: boolean): Set<string> {
  return new Set(
    proposals.filter(proposal => !acceptedOnly || proposal.executedAt !== null).flatMap(proposal => proposal.bountyIds)
  );
}

export function buildAccretionDashboard(inputs: AccretionMetricInputs): AccretionDashboardResult {
  const start = accretionPeriodStart(inputs.period, inputs.nowSeconds);
  const bountyById = new Map(inputs.bounties.map(bounty => [bounty.id, bounty]));
  const proposalById = new Map(inputs.proposals.map(proposal => [proposal.id, proposal]));
  const outputByProposalId = new Map(inputs.proposalOutputs.map(output => [output.proposalId, output]));

  const periodBounties = inputs.bounties.filter(bounty => isInPeriod(bounty.createdAt, start));
  const periodPayouts = inputs.payouts.filter(payout => isInPeriod(payout.createdAt, start));
  const acceptedPeriodProposals = inputs.proposals.filter(proposal => isInPeriod(proposal.executedAt, start));

  const unitCosts = buildUnitCosts(periodPayouts, proposalById, outputByProposalId);
  const unitCostByType = new Map(unitCosts.map(row => [row.typeId ?? `name:${row.typeName}`, row.medianUnitCost]));

  const periodOutputProposalIds = new Set(acceptedPeriodProposals.map(proposal => proposal.id));
  const periodArtifacts = inputs.proposalOutputs
    .filter(output => periodOutputProposalIds.has(output.proposalId))
    .flatMap(output => output.artifacts);

  const payoutProposalIds = new Set<string>();
  for (const payout of periodPayouts) {
    if (payout.amount === null) continue;
    const acceptedIds = [...new Set(payout.proposalIds)].filter(
      proposalId => proposalById.get(proposalId)?.executedAt !== null
    );
    if (
      acceptedIds.length > 0 &&
      acceptedIds.every(proposalId => (outputByProposalId.get(proposalId)?.artifacts.length ?? 0) > 0)
    ) {
      acceptedIds.forEach(proposalId => payoutProposalIds.add(proposalId));
    }
  }
  const retroArtifacts = inputs.proposalOutputs
    .filter(output => payoutProposalIds.has(output.proposalId))
    .flatMap(output => output.artifacts);
  const replacementValue = retroArtifacts.reduce(
    (sum, artifact) => sum + (unitCostByType.get(artifactKey(artifact)) ?? 0) * artifact.weightedUnits,
    0
  );
  const payoutAmount = periodPayouts.reduce((sum, payout) => sum + (payout.amount ?? 0), 0);
  const modeledPayoutAmount = unitCosts.reduce((sum, row) => sum + row.modeledSpend, 0);

  const postedIds = new Set(periodBounties.map(bounty => bounty.id));
  const submittedIds = uniqueBountyIds(inputs.proposals, false);
  const acceptedIds = uniqueBountyIds(inputs.proposals, true);
  const paidIds = new Set(periodPayouts.map(payout => payout.bountyId).filter((id): id is string => Boolean(id)));
  const onTimeIds = new Set<string>();
  for (const proposal of inputs.proposals) {
    if (proposal.executedAt === null) continue;
    for (const bountyId of proposal.bountyIds) {
      const deadline = bountyById.get(bountyId)?.deadline;
      if (deadline !== null && deadline !== undefined && proposal.executedAt <= deadline) onTimeIds.add(bountyId);
    }
  }

  const countPosted = (predicate: (id: string) => boolean) => [...postedIds].filter(predicate).length;
  const classifiedProposalCount = acceptedPeriodProposals.filter(proposal =>
    outputByProposalId.has(proposal.id)
  ).length;
  const native = periodArtifacts.filter(artifact => artifact.operation === 'created').length;
  const reused = periodArtifacts.filter(artifact => artifact.operation === 'reused').length;
  const unknown = periodArtifacts.filter(artifact => artifact.operation === 'unknown').length;

  const warnings = ['Payout amounts are nominal because historical currency and USD conversion are not modeled.'];
  if (inputs.payouts.some(payout => payout.recipientId === null)) {
    warnings.push('Curator cohorts are provisional because direct payout recipients are not populated consistently.');
  }
  if (inputs.diffLimitReached) {
    warnings.push(`Artifact metrics use the ${inputs.diffProposalLimit} most recent relevant proposal diffs.`);
  }
  if (inputs.sourceTruncated) warnings.push('At least one source collection reached its pagination safety cap.');

  return {
    period: inputs.period,
    asOf: new Date(inputs.nowSeconds * 1000).toISOString(),
    methodologyVersion: 'curator-program-v1',
    summary: {
      bountiesPosted: periodBounties.length,
      acceptedProposals: acceptedPeriodProposals.length,
      payoutAmount,
      modeledPayoutAmount,
      acceptedArtifacts: periodArtifacts.length,
      weightedOutputUnits: periodArtifacts.reduce((sum, artifact) => sum + artifact.weightedUnits, 0),
      replacementValue,
      retroactiveRoi: modeledPayoutAmount > 0 && replacementValue > 0 ? replacementValue / modeledPayoutAmount : null,
    },
    unitCosts,
    timeline: buildTimeline(inputs.period, inputs.bounties, inputs.proposals, inputs.payouts, start),
    curatorCohorts: buildCuratorCohorts(periodPayouts, bountyById, proposalById, outputByProposalId, unitCostByType),
    delivery: [
      { key: 'posted', label: 'Published', count: postedIds.size },
      {
        key: 'allocated',
        label: 'Allocated',
        count: countPosted(id => (bountyById.get(id)?.curatorIds.length ?? 0) > 0),
      },
      { key: 'submitted', label: 'Submitted', count: countPosted(id => submittedIds.has(id)) },
      { key: 'accepted', label: 'Accepted', count: countPosted(id => acceptedIds.has(id)) },
      { key: 'paid', label: 'Paid', count: countPosted(id => paidIds.has(id)) },
      { key: 'on-time', label: 'On time', count: countPosted(id => onTimeIds.has(id)) },
    ],
    duplication: {
      native,
      reused,
      unknown,
      unclassifiedProposals: Math.max(0, acceptedPeriodProposals.length - classifiedProposalCount),
    },
    coverage: {
      bounties: inputs.bounties.length,
      bountiesWithBudget: inputs.bounties.filter(bounty => bounty.budget !== null).length,
      bountiesWithStatus: inputs.bounties.filter(bounty => bounty.status !== null).length,
      bountiesWithDeadline: inputs.bounties.filter(bounty => bounty.deadline !== null).length,
      payouts: inputs.payouts.length,
      payoutsWithAmount: inputs.payouts.filter(payout => payout.amount !== null).length,
      payoutsWithRecipient: inputs.payouts.filter(payout => payout.recipientId !== null).length,
      acceptedProposals: acceptedPeriodProposals.length,
      classifiedProposals: classifiedProposalCount,
      diffProposalLimit: inputs.diffProposalLimit,
      diffLimitReached: inputs.diffLimitReached,
      sourceTruncated: inputs.sourceTruncated,
    },
    warnings,
  };
}
