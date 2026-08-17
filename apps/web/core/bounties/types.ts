export type Bounty = {
  id: string;
  spaceId?: string | null;
  /** Space name (or fallback) for review UI when bounties may come from multiple spaces. */
  spaceLabel?: string | null;
  /** Space cover/avatar image (IPFS URL or path) for the space row. */
  spaceImage?: string | null;
  name: string;
  description: string | null;
  budget: number | null;
  maxContributors?: number | null;
  submissionsPerPerson?: number | null;
  submissionsCount?: number;
  userSubmissionsCount?: number;
  /** Display label of the difficulty (Easy/Medium/Hard); see difficultyId for the entity. */
  difficulty: string | null;
  /** Display label of the workflow status; see statusId for the entity. */
  status: string | null;
  deadline: string | null;
};

/** A bounty as shown on the board and detail surfaces: the base view-model plus the relations the board filters on. */
export type BoardBounty = Bounty & {
  spaceId: string;
  /** Difficulty entity id (one of the three DIFFICULTY ids), null when unset. */
  difficultyId: string | null;
  /** Workflow status entity id (one of the six BOUNTY_STATUS ids); null means Backlog by convention. */
  statusId: string | null;
  skills: { id: string; name: string }[];
  maintainers: { id: string; name: string | null }[];
  /** Curators the bounty is allocated to (person or personal-space entity ids). */
  allocatedIds: string[];
  interestedCount: number;
  /** ISO string of the last time the entity was updated, when the API provides it. */
  updatedAt: string | null;
};
