'use client';

import { motion } from 'framer-motion';

import { TableBlockRanking } from './table-block-ranking';
import { TableBlockRankingSetup } from './table-block-ranking-setup';

type Props = {
  spaceId: string;
  blockId: string;
  rankingSetupPending?: boolean;
  onCompleteRankingSetup?: (dates: { startDate: string; endDate: string }) => void;
  rankingStartDate?: string;
  rankingEndDate?: string;
};

export function RankingBlock({
  spaceId,
  blockId,
  rankingSetupPending = false,
  onCompleteRankingSetup,
  rankingStartDate = '',
  rankingEndDate = '',
}: Props) {
  if (rankingSetupPending) {
    return (
      <TableBlockRankingSetup spaceId={spaceId} onCompleteRankingSetup={onCompleteRankingSetup ?? (() => {})} />
    );
  }

  if (!blockId) {
    return (
      <motion.div layout="position" transition={{ duration: 0.15 }}>
        <div className="min-h-[92px] rounded-lg bg-grey-01" />
      </motion.div>
    );
  }

  return (
    <TableBlockRanking spaceId={spaceId} rankingStartDate={rankingStartDate} rankingEndDate={rankingEndDate} />
  );
}
