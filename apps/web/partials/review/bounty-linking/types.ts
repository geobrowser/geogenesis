export type BountyDifficulty = 'LOW' | 'MEDIUM' | 'HARD' | 'EXPERT';

export type BountyStatus = 'OPEN' | 'ALLOCATED' | 'SELF_ASSIGNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export type Bounty = {
  id: string;
  spaceId?: string | null;
  name: string;
  description: string | null;
  budget: number | null;
  maxContributors?: number | null;
  submissionsPerPerson?: number | null;
  submissionsCount?: number;
  userSubmissionsCount?: number;
  difficulty: BountyDifficulty | null;
  status: BountyStatus | null;
  deadline: string | null;
};
