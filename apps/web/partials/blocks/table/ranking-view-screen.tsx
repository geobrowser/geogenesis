'use client';

import cx from 'classnames';

import { useIsMobileLayout } from '~/core/hooks/use-is-mobile-layout';

import { RankingComposeFullscreen } from './ranking-compose-fullscreen';
import { RankingTableView } from './ranking-table-view';
import { type InitialGlobalRanking } from './use-ranking-block-state';

type Props = {
  spaceId: string;
  rankingStartDate?: string;
  rankingEndDate?: string;
  rankEntityId?: string;
  authorSpaceId?: string;
  ogVersion?: string;
  initialGlobalRanking?: InitialGlobalRanking;
};

/** Fullscreen ranking browse view — compose-aligned typography, separate from the embedded block. */
export function RankingViewScreen({
  spaceId,
  rankingStartDate = '',
  rankingEndDate = '',
  rankEntityId = '',
  authorSpaceId = '',
  ogVersion = '',
  initialGlobalRanking,
}: Props) {
  const isMobile = useIsMobileLayout();

  return (
    <RankingComposeFullscreen>
      <div
        className={cx(
          'relative flex min-h-0 flex-1 flex-col overflow-hidden px-4 pt-4 pb-2',
          isMobile ? '' : 'mx-auto w-full max-w-[1200px]'
        )}
      >
        <RankingTableView
          spaceId={spaceId}
          rankingStartDate={rankingStartDate}
          rankingEndDate={rankingEndDate}
          rankEntityId={rankEntityId}
          authorSpaceId={authorSpaceId}
          ogVersion={ogVersion}
          initialGlobalRanking={initialGlobalRanking}
        />
      </div>
    </RankingComposeFullscreen>
  );
}
