export type RankingSubmissionAuthor = {
  spaceId: string;
  address: string;
  name: string | null;
  avatarUrl: string | null;
};

export type RankingSubmissionRecord = {
  id: string;
  authorSpaceId: string;
  targetBlockId: string;
  targetBlockSpaceId: string;
  orderedEntityIds: string[];
  createdAt: string;
  author: RankingSubmissionAuthor;
};

export type RankingSubmissionSlot = {
  id: string;
  name: string | null;
  spaceId?: string;
  /**
   * Best debates (GEO-3729): the entry's grade, or `null` to ungrade it. Left out, the entry keeps
   * the grade it has, so a publish that doesn't know about grades never wipes them.
   */
  grade?: import('./ranking-grades').Grade | null;
};
