export type BountyContributor = {
  entityId: string;
  name: string;
  avatarUrl: string | null;
};

export type SpaceBounty = {
  id: string;
  spaceId: string;
  name: string;
  description: string | null;
  budget: number | null;
  difficulty: string | null;
  skills: string[];
  isFeatured: boolean;
  contributors: BountyContributor[];
  /** ISO datetime; drives the card's "Ended" state. */
  deadline?: string | null;
  maxContributors?: number | null;
  /** Distinct allocation targets; with maxContributors, drives "Spots filled". */
  allocatedCount?: number;
};

export type SpaceBountiesResult = {
  bounties: SpaceBounty[];
  skills: string[];
  truncated: boolean;
  totalCount?: number;
};
