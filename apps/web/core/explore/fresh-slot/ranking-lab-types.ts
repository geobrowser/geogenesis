/** Shapes and names the ranking lab's client and server share (GEO-3221). Nothing server-only. */

/** The header the client sends its geo-chat access token in; see `requireRankingLabAdmin`. */
export const GEO_CHAT_AUTHORIZATION_HEADER = 'x-geo-chat-authorization';

export type RankingLabPreviewItem = {
  entityId: string;
  spaceId: string;
  title: string;
  typeId: string;
  typeName: string | null;
  createdAtSec: number;
  fresh: boolean;
};

export type RankingLabPreviewResponse = {
  best: RankingLabPreviewItem[][];
  merged: RankingLabPreviewItem[][];
  mergedVersion: string | null;
  /** Entity ids served more than once across the merged pages. Should always be empty. */
  repeats: string[];
  adjustments: string[];
};
