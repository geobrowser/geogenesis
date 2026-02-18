export type BountyDifficulty = 'LOW' | 'MEDIUM' | 'HARD' | 'EXPERT';

export type BountyStatus = 'OPEN' | 'ALLOCATED' | 'SELF_ASSIGNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export type Bounty = {
  id: string;
  name: string;
  description: string | null;
  maxPayout: number | null;
  difficulty: BountyDifficulty | null;
  status: BountyStatus | null;
  deadline: string | null;
  yourSubmissions: { current: number; max: number } | null;
};
