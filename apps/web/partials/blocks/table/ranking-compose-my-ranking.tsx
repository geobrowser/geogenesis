'use client';

import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import cx from 'classnames';

import { getRowDescription, getRowDisplayName } from '~/core/blocks/ranking/ranking-rankable-list';
import type { RankingEntryDisplay } from '~/core/blocks/ranking/use-ranking-entry-entities';
import type { Row, SearchResult } from '~/core/types';

import { Button } from '~/design-system/button';

import { RankingMyRankingDesktopRow } from './ranking-block-ui';
import { RANKING_COMPOSE_PUBLISH_BUTTON_CLASS } from './ranking-compose-header';
import { RankingComposeSwipeableRow } from './ranking-compose-swipeable-row';
import { RankingEntryRow } from './ranking-entry-row';
import { RankingMyRankingDndList } from './ranking-my-ranking-dnd';

type Props = {
  isMobile: boolean;
  spaceId: string;
  displayEntityIds: string[];
  isLoading: boolean;
  entriesById: Map<string, RankingEntryDisplay>;
  searchResultsById: Map<string, SearchResult>;
  rowsByEntityId: Map<string, Row>;
  canPublish: boolean;
  isSaving: boolean;
  hidePublishButton: boolean;
  activeSwipeRowKey: string | null;
  onActiveSwipeRowKeyChange: (key: string | null) => void;
  onPublish: () => void;
  onReorder: (entityIds: string[]) => void;
  onRemove: (entityId: string) => void;
  onView: (entityId: string) => void;
};

export function RankingComposeMyRanking({
  isMobile,
  spaceId,
  displayEntityIds,
  isLoading,
  entriesById,
  searchResultsById,
  rowsByEntityId,
  canPublish,
  isSaving,
  hidePublishButton,
  activeSwipeRowKey,
  onActiveSwipeRowKeyChange,
  onPublish,
  onReorder,
  onRemove,
  onView,
}: Props) {
  const isDesktop = !isMobile;

  return (
    <div className={cx('flex flex-col', isDesktop && 'min-h-0 flex-1', isMobile && 'border-t border-grey-02 pt-8')}>
      <div
        className={cx(
          'grid w-full min-w-0 shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3',
          isDesktop && 'border-b border-grey-02 pb-4'
        )}
      >
        <h2
          className={cx(
            'm-0 min-w-0 truncate text-text',
            isMobile ? 'text-[22px] font-medium' : 'text-[17px] font-semibold'
          )}
        >
          My ranking
        </h2>
        {isDesktop && !hidePublishButton ? (
          <Button
            variant="primary"
            className={cx(RANKING_COMPOSE_PUBLISH_BUTTON_CLASS, 'justify-self-end')}
            disabled={!canPublish}
            onClick={onPublish}
          >
            {isSaving ? 'Publishing…' : 'Publish ranking'}
          </Button>
        ) : null}
      </div>
      <div className={cx('flex flex-col', isDesktop && 'min-h-0 flex-1 overflow-y-auto pt-4')}>
        {isLoading ? (
          <p className="text-metadata text-grey-03">Loading your ranking…</p>
        ) : displayEntityIds.length === 0 ? (
          <p className="text-metadata text-grey-04">Add or search from movies in global ranking to get started</p>
        ) : (
          <RankingMyRankingDndList
            entityIds={displayEntityIds}
            onReorder={onReorder}
            onDragStart={() => onActiveSwipeRowKeyChange(null)}
            className="flex flex-col"
            renderItem={(entityId, index, isDragActive) => {
              const entry = entriesById.get(entityId);
              const row = rowsByEntityId.get(entityId);
              const searchHit = searchResultsById.get(entityId);
              if (!entry && !row && !searchHit) return null;
              const entryDisplay = {
                entityId,
                name: entry?.name ?? (row ? getRowDisplayName(row) : searchHit?.name?.trim() || 'Untitled'),
                description: entry?.description ?? (row ? getRowDescription(row) : (searchHit?.description ?? null)),
                image:
                  entry?.image ?? row?.columns[SystemIds.NAME_PROPERTY]?.image ?? searchHit?.spaces[0]?.image ?? null,
              };
              const entryRow = (
                <RankingEntryRow
                  rank={index + 1}
                  rankStyle="leading"
                  linkToEntity={false}
                  entry={entryDisplay}
                  spaceId={spaceId}
                />
              );

              const rowContent = !isMobile ? (
                <RankingMyRankingDesktopRow
                  entityName={entryDisplay.name}
                  onRemove={() => onRemove(entityId)}
                  onOpenSidePanel={() => onView(entityId)}
                  hideActions={isDragActive}
                >
                  {entryRow}
                </RankingMyRankingDesktopRow>
              ) : (
                <RankingComposeSwipeableRow
                  rowKey={`my:${entityId}`}
                  activeRowKey={activeSwipeRowKey}
                  onActiveRowKeyChange={onActiveSwipeRowKeyChange}
                  showRemove
                  onView={() => onView(entityId)}
                  onRemove={() => onRemove(entityId)}
                  onPrimaryClick={() => onRemove(entityId)}
                  primaryDisabled={isDragActive}
                >
                  {entryRow}
                </RankingComposeSwipeableRow>
              );

              return <div className="w-full py-3">{rowContent}</div>;
            }}
          />
        )}
      </div>
    </div>
  );
}
