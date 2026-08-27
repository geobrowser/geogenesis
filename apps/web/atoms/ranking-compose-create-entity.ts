import { atom } from 'jotai';

export type RankingComposeCreateEntityFlow = {
  entityId: string;
  publishSpaceId: string;
  publishSpaceIds: string[];
};

export const rankingComposeCreateEntityAtom = atom<RankingComposeCreateEntityFlow | null>(null);
