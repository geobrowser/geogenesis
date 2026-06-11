'use client';

import cx from 'classnames';

import { useIsMobileLayout } from '~/core/hooks/use-is-mobile-layout';

import { RankingComposeFullscreen } from './ranking-compose-fullscreen';
import { RankingTableView } from './ranking-table-view';

type Props = {
  spaceId: string;
  rankingStartDate?: string;
  rankingEndDate?: string;
};

/** Fullscreen ranking browse view — compose-aligned typography, separate from the embedded block. */
export function RankingViewScreen({ spaceId, rankingStartDate = '', rankingEndDate = '' }: Props) {
  const isMobile = useIsMobileLayout();

  return (
    <RankingComposeFullscreen
      style={{
        display: 'grid',
        gridTemplateRows: 'minmax(0, 1fr)',
      }}
    >
      <div
        className={cx(
          'relative flex h-full min-h-0 flex-col overflow-hidden px-4 py-2',
          isMobile ? '' : 'mx-auto w-full max-w-[1200px]'
        )}
      >
        <RankingTableView spaceId={spaceId} rankingStartDate={rankingStartDate} rankingEndDate={rankingEndDate} />
      </div>
    </RankingComposeFullscreen>
  );
}
