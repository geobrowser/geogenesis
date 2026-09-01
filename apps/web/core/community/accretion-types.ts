export type AccretionPeriod = 'week' | 'month' | 'year' | 'all';

export type AccretionScope = 'space' | 'protocol';

export const ACCRETION_SCOPE_OPTIONS: { value: AccretionScope; label: string }[] = [
  { value: 'space', label: 'This space' },
  { value: 'protocol', label: 'Protocol' },
];

export const ACCRETION_PERIOD_OPTIONS: { value: AccretionPeriod; label: string }[] = [
  { value: 'week', label: 'Last week' },
  { value: 'month', label: 'Last month' },
  { value: 'year', label: 'Last year' },
  { value: 'all', label: 'All time' },
];

export type AccretionArtifactOperation = 'created' | 'reused' | 'unknown';

export type AccretionArtifact = {
  entityId: string;
  typeId: string | null;
  typeName: string;
  operation: AccretionArtifactOperation;
  weightedUnits: number;
};

export type AccretionBountyInput = {
  id: string;
  name: string;
  createdAt: number | null;
  budget: number | null;
  deadline: number | null;
  status: string | null;
  curatorIds: string[];
  curatorNames: Record<string, string>;
};

export type AccretionProposalInput = {
  id: string;
  spaceId: string;
  bountyIds: string[];
  proposedBy: string;
  proposedByName: string | null;
  createdAt: number | null;
  executedAt: number | null;
};

export type AccretionPayoutInput = {
  id: string;
  bountyId: string | null;
  proposalIds: string[];
  amount: number | null;
  createdAt: number | null;
  recipientId: string | null;
  recipientName: string | null;
};

export type AccretionProposalOutputInput = {
  proposalId: string;
  artifacts: AccretionArtifact[];
};

export type AccretionMetricInputs = {
  period: AccretionPeriod;
  nowSeconds: number;
  bounties: AccretionBountyInput[];
  proposals: AccretionProposalInput[];
  payouts: AccretionPayoutInput[];
  proposalOutputs: AccretionProposalOutputInput[];
  diffProposalLimit: number;
  diffLimitReached: boolean;
  sourceTruncated: boolean;
};

export type AccretionUnitCostRow = {
  typeId: string | null;
  typeName: string;
  rawUnits: number;
  weightedUnits: number;
  proposalSamples: number;
  medianUnitCost: number;
  modeledSpend: number;
};

export type AccretionTimelinePoint = {
  key: string;
  label: string;
  bountiesPosted: number;
  bountiesDelivered: number;
  payoutAmount: number;
};

export type AccretionCuratorCohort = {
  curatorId: string;
  name: string;
  payoutAmount: number;
  outputUnits: number;
  replacementValue: number;
  efficiency: number | null;
  inferred: boolean;
};

export type AccretionDeliveryStage = {
  key: 'posted' | 'allocated' | 'submitted' | 'accepted' | 'paid' | 'on-time';
  label: string;
  count: number;
};

export type AccretionCoverage = {
  bounties: number;
  bountiesWithBudget: number;
  bountiesWithStatus: number;
  bountiesWithDeadline: number;
  payouts: number;
  payoutsWithAmount: number;
  payoutsWithRecipient: number;
  acceptedProposals: number;
  classifiedProposals: number;
  diffProposalLimit: number;
  diffLimitReached: boolean;
  sourceTruncated: boolean;
};

export type AccretionDashboardResult = {
  period: AccretionPeriod;
  asOf: string;
  methodologyVersion: 'curator-program-v1';
  summary: {
    bountiesPosted: number;
    acceptedProposals: number;
    payoutAmount: number;
    modeledPayoutAmount: number;
    acceptedArtifacts: number;
    weightedOutputUnits: number;
    replacementValue: number;
    retroactiveRoi: number | null;
  };
  unitCosts: AccretionUnitCostRow[];
  timeline: AccretionTimelinePoint[];
  curatorCohorts: AccretionCuratorCohort[];
  delivery: AccretionDeliveryStage[];
  duplication: {
    native: number;
    reused: number;
    unknown: number;
    unclassifiedProposals: number;
  };
  coverage: AccretionCoverage;
  warnings: string[];
};
