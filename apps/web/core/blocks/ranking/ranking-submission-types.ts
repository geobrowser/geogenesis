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
  isPublishing?: boolean;
  isPendingPublish?: boolean;
};

export type RankingSubmissionSlot = {
  id: string;
  name: string | null;
  spaceId?: string;
};
