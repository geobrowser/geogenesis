'use client';

import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import * as React from 'react';

import cx from 'classnames';

import { getRowDescription, getRowDisplayName } from '~/core/blocks/ranking/ranking-rankable-list';
import type { RankingEntryDisplay } from '~/core/blocks/ranking/use-ranking-entry-entities';
import type { Row, SearchResult } from '~/core/types';

import { Button } from '~/design-system/button';

import { RankingMyRankingDesktopRow } from './ranking-block-ui';
import { RANKING_COMPOSE_PUBLISH_BUTTON_CLASS } from './ranking-compose-header';
import { RankingComposeSwipeableRow } from './ranking-compose-swipeable-row';
import {
  RANKING_DROP_ROW_ATTRIBUTE,
  RANKING_ENTITY_DRAG_TYPE,
  dropIndexFromPointer,
  isRankingEntityDrag,
} from './ranking-entity-drag';
import { RankingEntryRow } from './ranking-entry-row';
import { RankingMyRankingDndList } from './ranking-my-ranking-dnd';

type Props = {
  isMobile: boolean;
  spaceId: string;
  displayEntityIds: string[];
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
  /** Best debates: no side-panel button on the rows (the poster opens the debate to watch). */
  hideSidePanel?: boolean;
  pendingEntityIds: ReadonlySet<string>;
  /** Rendered under the list, e.g. the Best debates "You pushed down" section (GEO-3679). */
  footer?: React.ReactNode;
  /** The publish button's label in place of "Publish ranking" (Best debates: "Publish 3 changes"). */
  publishLabel?: string;
  /** Phones with the Team / Your ranking tabs: the tab names the column, so no heading or rule. */
  hideMobileHeading?: boolean;
  /** The column's heading; "My ranking" unless the block says otherwise (Best debates: "Your ranking"). */
  title?: string;
  emptyText?: string;
  /**
   * Accept entities dragged in from the other column, at the index they are dropped on (GEO-3678).
   * Left out, the list takes no drops, as before.
   */
  onDropEntity?: (entityId: string, index: number) => void;
};

/** Native drops onto the list: where the pointer would put the entity, and the drop itself. */
function useEntityDrop(onDropEntity: Props['onDropEntity']) {
  const listRef = React.useRef<HTMLDivElement>(null);
  const [dropIndex, setDropIndex] = React.useState<number | null>(null);

  const indexAt = (clientY: number) => {
    const rows = listRef.current?.querySelectorAll<HTMLElement>(`[${RANKING_DROP_ROW_ATTRIBUTE}]`) ?? [];
    const middles = Array.from(rows, row => {
      const rect = row.getBoundingClientRect();
      return rect.top + rect.height / 2;
    });
    return dropIndexFromPointer(middles, clientY);
  };

  if (!onDropEntity) return { listRef, dropIndex: null, dropHandlers: {} };

  const dropHandlers: React.HTMLAttributes<HTMLDivElement> = {
    onDragOver: event => {
      if (!isRankingEntityDrag(event.dataTransfer)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
      setDropIndex(indexAt(event.clientY));
    },
    onDragLeave: event => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropIndex(null);
    },
    onDrop: event => {
      const entityId = event.dataTransfer.getData(RANKING_ENTITY_DRAG_TYPE);
      setDropIndex(null);
      if (!entityId) return;
      event.preventDefault();
      onDropEntity(entityId, indexAt(event.clientY));
    },
  };

  return { listRef, dropIndex, dropHandlers };
}

export function RankingComposeMyRanking({
  isMobile,
  spaceId,
  displayEntityIds,
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
  hideSidePanel = false,
  pendingEntityIds,
  footer,
  title = 'My ranking',
  hideMobileHeading = false,
  publishLabel,
  emptyText = 'Add or search global ranking list to get started',
  onDropEntity,
}: Props) {
  const isDesktop = !isMobile;
  const [isReordering, setIsReordering] = React.useState(false);
  const { listRef, dropIndex, dropHandlers } = useEntityDrop(onDropEntity);

  return (
    <div
      className={cx(
        'flex flex-col',
        isDesktop && 'min-h-0 flex-1',
        isMobile && !hideMobileHeading && 'border-t border-grey-02 pt-8'
      )}
    >
      <div
        hidden={isMobile && hideMobileHeading}
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
          {title}
        </h2>
        {isDesktop && !hidePublishButton ? (
          <Button
            variant="primary"
            className={cx(RANKING_COMPOSE_PUBLISH_BUTTON_CLASS, 'justify-self-end')}
            disabled={!canPublish}
            onClick={onPublish}
            data-analytics-feature="ranking-submit"
          >
            {isSaving ? 'Publishing…' : (publishLabel ?? 'Publish ranking')}
          </Button>
        ) : null}
      </div>
      <div
        ref={listRef}
        data-testid={onDropEntity ? 'ranking-drop-target' : undefined}
        className={cx('flex flex-col', isDesktop && 'min-h-0 flex-1 overflow-y-auto pt-4')}
        {...dropHandlers}
      >
        {displayEntityIds.length === 0 ? (
          <p
            className={cx(
              'text-metadata text-grey-04',
              dropIndex !== null && 'rounded-md border border-dashed border-text p-4'
            )}
          >
            {emptyText}
          </p>
        ) : (
          <RankingMyRankingDndList
            entityIds={displayEntityIds}
            onReorder={onReorder}
            onDragStart={() => {
              onActiveSwipeRowKeyChange(null);
              setIsReordering(true);
            }}
            onDragEnd={() => setIsReordering(false)}
            className="flex flex-col"
            renderItem={(entityId, index, isDragActive, overlayImageUrl) => {
              const entry = entriesById.get(entityId);
              const row = rowsByEntityId.get(entityId);
              const searchHit = searchResultsById.get(entityId);
              if (!entry && !row && !searchHit) return null;
              const entryDisplay = {
                entityId,
                name: entry?.name ?? (row ? getRowDisplayName(row) : searchHit?.name?.trim() || 'Untitled'),
                description: entry?.description ?? (row ? getRowDescription(row) : (searchHit?.description ?? null)),
                image: entry?.image ?? row?.columns[SystemIds.NAME_PROPERTY]?.image ?? null,
              };
              const entryRow = (
                <RankingEntryRow
                  rank={index + 1}
                  rankStyle="leading"
                  linkToEntity={false}
                  pending={pendingEntityIds.has(entityId)}
                  entry={entryDisplay}
                  spaceId={spaceId}
                  imageUrl={overlayImageUrl}
                />
              );

              const rowContent = !isMobile ? (
                <RankingMyRankingDesktopRow
                  entityName={entryDisplay.name}
                  onRemove={() => onRemove(entityId)}
                  onOpenSidePanel={hideSidePanel ? undefined : () => onView(entityId)}
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
                  swipeEnabled={!isReordering}
                  onView={() => onView(entityId)}
                  onRemove={() => onRemove(entityId)}
                  primaryDisabled={isDragActive}
                >
                  {entryRow}
                </RankingComposeSwipeableRow>
              );

              const dropAttribute = { [RANKING_DROP_ROW_ATTRIBUTE]: entityId };
              return (
                <div className="relative w-full py-3" {...dropAttribute}>
                  {dropIndex === index ? (
                    <span className="absolute inset-x-0 top-0 h-0.5 rounded-full bg-text" aria-hidden />
                  ) : null}
                  {dropIndex === displayEntityIds.length && index === displayEntityIds.length - 1 ? (
                    <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-text" aria-hidden />
                  ) : null}
                  {rowContent}
                </div>
              );
            }}
          />
        )}
        {footer}
      </div>
    </div>
  );
}
