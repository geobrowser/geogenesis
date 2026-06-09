'use client';

import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import cx from 'classnames';

import { getRowDescription, getRowDisplayName } from '~/core/blocks/ranking/ranking-rankable-list';
import type { RankingEntryDisplay } from '~/core/blocks/ranking/use-ranking-entry-entities';
import type { Row } from '~/core/types';

import { Button } from '~/design-system/button';

import { RankingComposeSwipeableRow } from './ranking-compose-swipeable-row';
import { RankingEntryRow } from './ranking-entry-row';
import { RankingMyRankingDndList } from './ranking-my-ranking-dnd';

type Props = {
  isMobile: boolean;
  spaceId: string;
  displayEntityIds: string[];
  isLoading: boolean;
  entriesById: Map<string, RankingEntryDisplay>;
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
    <div className={cx('flex flex-col', isDesktop && 'min-h-0 flex-1')}>
      <div
        className={cx(
          'grid w-full min-w-0 shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3',
          isDesktop && 'h-10 border-b border-grey-02'
        )}
      >
        <h2 className="m-0 min-w-0 truncate text-smallTitle font-medium text-text">My ranking</h2>
        {!hidePublishButton ? (
          <Button
            variant="primary"
            className="h-8 justify-self-end !rounded-full px-3 whitespace-nowrap"
            disabled={!canPublish}
            onClick={onPublish}
          >
            {isSaving ? 'Publishing…' : 'Publish ranking'}
          </Button>
        ) : null}
      </div>
      <div className={cx('flex flex-col', isDesktop && 'min-h-0 flex-1 overflow-y-auto')}>
        {isLoading ? (
          <p className="text-metadata text-grey-03">Loading your ranking…</p>
        ) : displayEntityIds.length === 0 ? (
          <p className="text-metadata text-grey-04">Select entries from Global ranking to build your list.</p>
        ) : (
          <RankingMyRankingDndList
            entityIds={displayEntityIds}
            onReorder={onReorder}
            onDragStart={() => onActiveSwipeRowKeyChange(null)}
            className="flex flex-col gap-3"
            renderItem={(entityId, index) => {
              const entry = entriesById.get(entityId);
              const row = rowsByEntityId.get(entityId);
              if (!entry && !row) return null;
              const entryDisplay = entry ?? {
                entityId,
                name: row ? getRowDisplayName(row) : 'Untitled',
                description: row ? getRowDescription(row) : null,
                image: row?.columns[SystemIds.NAME_PROPERTY]?.image ?? null,
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

              if (!isMobile) {
                return entryRow;
              }

              return (
                <RankingComposeSwipeableRow
                  rowKey={`my:${entityId}`}
                  activeRowKey={activeSwipeRowKey}
                  onActiveRowKeyChange={onActiveSwipeRowKeyChange}
                  showRemove
                  onView={() => onView(entityId)}
                  onRemove={() => onRemove(entityId)}
                  primaryDisabled
                >
                  {entryRow}
                </RankingComposeSwipeableRow>
              );
            }}
          />
        )}
      </div>
    </div>
  );
}
