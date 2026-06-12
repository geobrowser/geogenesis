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
  rankEntityId?: string;
  authorSpaceId?: string;
  ogVersion?: string;
};

async function shareStoryImage(rankEntityId: string, ogVersion: string) {
  const imageUrl = `/api/ranking-og/file?${new URLSearchParams({
    rankEntityId,
    ogVersion,
    variant: 'story',
  }).toString()}`;
  const response = await fetch(imageUrl);
  if (!response.ok) {
    window.location.href = imageUrl;
    return;
  }

  const blob = await response.blob();
  const file = new File([blob], 'geo-ranking-story.png', { type: blob.type || 'image/png' });
  const navigatorWithShare = navigator as Navigator & {
    canShare?: (data: ShareData) => boolean;
    share?: (data: ShareData) => Promise<void>;
  };
  const shareData: ShareData = {
    files: [file],
    title: 'Geo ranking',
  };

  if (navigatorWithShare.canShare?.(shareData) && navigatorWithShare.share) {
    await navigatorWithShare.share(shareData);
    return;
  }

  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = 'geo-ranking-story.png';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}

/** Fullscreen ranking browse view — compose-aligned typography, separate from the embedded block. */
export function RankingViewScreen({
  spaceId,
  rankingStartDate = '',
  rankingEndDate = '',
  rankEntityId = '',
  authorSpaceId = '',
  ogVersion = '',
}: Props) {
  const router = useRouter();
  const isMobile = useIsMobileLayout();
  const canShareStory = Boolean(rankEntityId && ogVersion);

  return (
    <RankingComposeFullscreen
      style={{
        display: 'grid',
        gridTemplateRows: 'auto minmax(0, 1fr)',
      }}
    >
      <div
        className={cx('flex items-center justify-between px-4 py-2', isMobile ? '' : 'mx-auto w-full max-w-[1200px]')}
      >
        <Button
          type="button"
          variant="ghost"
          icon={<ArrowLeft color="grey-04" />}
          onClick={() => router.back()}
          className={cx(COMPOSE_ICON_BUTTON_CLASS, 'h-7 w-7 shrink-0 hover:!bg-grey-01')}
          aria-label="Close ranking view"
        />
        {canShareStory ? (
          <Button
            type="button"
            variant="secondary"
            small
            className="h-7 shrink-0 !rounded-full !px-3"
            onClick={() => void shareStoryImage(rankEntityId, ogVersion)}
          >
            Story
          </Button>
        ) : null}
      </div>
      <div
        className={cx(
          'relative flex h-full min-h-0 flex-col overflow-hidden px-4',
          isMobile ? '' : 'mx-auto w-full max-w-[1200px]'
        )}
      >
        <RankingTableView
          spaceId={spaceId}
          rankingStartDate={rankingStartDate}
          rankingEndDate={rankingEndDate}
          rankEntityId={rankEntityId}
          authorSpaceId={authorSpaceId}
        />
      </div>
    </RankingComposeFullscreen>
  );
}
