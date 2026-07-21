'use client';

import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { Source } from '~/core/blocks/data/source';
import { Cell } from '~/core/types';

import { SelectEntity } from '~/design-system/select-entity';

import type { onChangeEntryFn, onLinkEntryFn } from '~/partials/blocks/table/change-entry';
import { ExploreFeedCard } from '~/partials/explore/explore-feed-card';

import { useBlockExploreFeedItem } from './use-block-explore-feed-item';

type Props = {
  columns: Record<string, Cell>;
  currentSpaceId: string;
  blockSpaceId: string;
  isEditing: boolean;
  rowEntityId: string;
  onChangeEntry: onChangeEntryFn;
  onLinkEntry: onLinkEntryFn;
  isPlaceholder: boolean;
  source: Source;
  autoFocus?: boolean;
  focusRequestKey?: number;
  collectionTypeFilters?: { id: string; name: string | null }[];
};

export function TableBlockExploreItem({
  columns,
  currentSpaceId,
  blockSpaceId,
  isEditing,
  rowEntityId,
  onChangeEntry,
  isPlaceholder,
  source,
  autoFocus = false,
  focusRequestKey,
  collectionTypeFilters,
}: Props) {
  const nameCell = columns[SystemIds.NAME_PROPERTY];
  const entitySpaceId = nameCell?.space ?? currentSpaceId;
  const showPlaceholderPicker = isEditing && isPlaceholder && source.type === 'COLLECTION';

  const item = useBlockExploreFeedItem({
    rowEntityId,
    entitySpaceId,
    blockSpaceId,
    columns,
    enabled: !showPlaceholderPicker,
    isMemberOrEditor: true,
  });

  if (showPlaceholderPicker) {
    return (
      <div className="border-b border-divider py-4 last:border-b-0">
        <SelectEntity
          onCreateEntity={result => {
            onChangeEntry(rowEntityId, currentSpaceId, { type: 'CREATE_ENTITY', name: result.name });
            return rowEntityId;
          }}
          onDone={(result, fromCreateFn) => {
            if (fromCreateFn) return;
            onChangeEntry(rowEntityId, currentSpaceId, { type: 'FIND_ENTITY', entity: result });
          }}
          spaceId={currentSpaceId}
          autoFocus={autoFocus}
          focusRequestKey={focusRequestKey}
          relationValueTypes={collectionTypeFilters}
        />
      </div>
    );
  }

  return <ExploreFeedCard item={item} hideSpaceLink hideJoinButton />;
}
