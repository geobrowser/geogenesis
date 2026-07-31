export type BountyContributor = {
  entityId: string;
  name: string;
  avatarUrl: string | null;
};

export type SpaceBounty = {
  id: string;
  spaceId: string;
  name: string;
  budget: number | null;
  difficulty: string | null;
  skills: string[];
  isFeatured: boolean;
  contributors: BountyContributor[];
};

export type SpaceBountiesResult = {
  bounties: SpaceBounty[];
  skills: string[];
};
