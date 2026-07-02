'use client';

import { ContentIds } from '@geoprotocol/geo-sdk/lite';

import * as React from 'react';

import type { ExploreSort, ExploreTime } from '~/core/explore/fetch-explore-feed';

import { EntityFeed, EntityFeedFilters } from '~/partials/feed/entity-feed';
import { AddDataChip, AddDataPanel } from '~/partials/space-page/add-data-panel';

const NEWS_STORY_TYPE_IDS = [ContentIds.NEWS_STORY_TYPE] as const;

/**
 * Space-home "News stories" section: an explore-style infinite feed scoped to this space and
 * to News story entities, with the import ("inject") widget moved here. The collapsed import
 * chip sits next to the header and the expanded paste-URL panel renders beneath it — both
 * self-gate on edit permission and share `addDataPanelExpandedAtom`, so only one shows at a time.
 */
export function NewsStoriesSection({ spaceId }: { spaceId: string }) {
  const [sort, setSort] = React.useState<ExploreSort>('top');
  const [time, setTime] = React.useState<ExploreTime>('week');

  return (
    <div className="mx-auto w-full max-w-[880px]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h4 className="text-mediumTitle font-medium">News stories</h4>
          <AddDataChip spaceId={spaceId} />
        </div>
        <EntityFeedFilters
          sort={sort}
          onSortChange={setSort}
          time={time}
          onTimeChange={setTime}
          showSortFilter
          showTimeFilter
        />
      </div>
      <div className="mt-4">
        <AddDataPanel spaceId={spaceId} />
      </div>
      <EntityFeed
        apiEndpoint="/api/space/feed"
        lockedSpaceId={spaceId}
        typeIds={NEWS_STORY_TYPE_IDS}
        sort={sort}
        time={time}
        showFilterRow={false}
        embedded
        feedTopSpacingClassName="mt-4"
      />
    </div>
  );
}
