'use client';

import cx from 'classnames';
import { useRouter } from 'next/navigation';

import { useIsMobileLayout } from '~/core/hooks/use-is-mobile-layout';

import { Button } from '~/design-system/button';
import { ArrowLeft } from '~/design-system/icons/arrow-left';

import { RankingComposeFullscreen } from './ranking-compose-fullscreen';
import { COMPOSE_ICON_BUTTON_CLASS } from './ranking-compose-header';
import { RankingTableView } from './ranking-table-view';

type Props = {
  spaceId: string;
  rankingStartDate?: string;
  rankingEndDate?: string;
};

/** Fullscreen ranking browse view — compose-aligned typography, separate from the embedded block. */
export function RankingViewScreen({ spaceId, rankingStartDate = '', rankingEndDate = '' }: Props) {
  const router = useRouter();
  const isMobile = useIsMobileLayout();

  return (
    <RankingComposeFullscreen
      style={{
        display: 'grid',
        gridTemplateRows: 'auto minmax(0, 1fr)',
      }}
    >
      <div className={cx('px-4 py-2', isMobile ? '' : 'mx-auto w-full max-w-[1200px]')}>
        <Button
          type="button"
          variant="ghost"
          icon={<ArrowLeft color="grey-04" />}
          onClick={() => router.back()}
          className={cx(COMPOSE_ICON_BUTTON_CLASS, 'h-7 w-7 shrink-0 hover:!bg-grey-01')}
          aria-label="Close ranking view"
        />
      </div>
      <div
        className={cx(
          'relative flex h-full min-h-0 flex-col overflow-hidden px-4',
          isMobile ? '' : 'mx-auto w-full max-w-[1200px]'
        )}
      >
        <RankingTableView spaceId={spaceId} rankingStartDate={rankingStartDate} rankingEndDate={rankingEndDate} />
      </div>
    </RankingComposeFullscreen>
  );
}
