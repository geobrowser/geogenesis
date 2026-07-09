'use client';

import { SystemIds } from '@geoprotocol/geo-sdk/lite';
import { useQuery } from '@tanstack/react-query';
import { Effect } from 'effect';

import { Source } from '~/core/blocks/data/source';
import type { ExploreFeedItem } from '~/core/explore/fetch-explore-feed';
import { parseEntityUpdatedAtToUnixSec } from '~/core/explore/explore-relative-time';
import { useSpace } from '~/core/hooks/use-space';
import { getEntityBacklinks } from '~/core/io/queries';
import { useAvatar, useCover, useDescription, useEntityTypes, useName } from '~/core/state/entity-page-store/entity-store';
import { useQueryEntity } from '~/core/sync/use-store';
import { Cell } from '~/core/types';

import { SelectEntity } from '~/design-system/select-entity';

import type { onChangeEntryFn, onLinkEntryFn } from '~/partials/blocks/table/change-entry';
import { ExploreFeedCard } from '~/partials/explore/explore-feed-card';

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

function useExploreFeedItem({
  rowEntityId,
  entitySpaceId,
  blockSpaceId,
  columns,
  enabled,
}: {
  rowEntityId: string;
  entitySpaceId: string;
  blockSpaceId: string;
  columns: Record<string, Cell>;
  enabled: boolean;
}): ExploreFeedItem {
  const nameCell = columns[SystemIds.NAME_PROPERTY];
  const types = useEntityTypes(rowEntityId, entitySpaceId);
  const name = useName(rowEntityId, entitySpaceId) ?? nameCell?.name ?? 'Untitled';
  const description = useDescription(rowEntityId, entitySpaceId) ?? nameCell?.description ?? null;
  const avatarUrl = useAvatar(rowEntityId, entitySpaceId);
  const coverUrl = useCover(rowEntityId, entitySpaceId);
  const imageUrl = (typeof coverUrl === 'string' ? coverUrl : null) ?? (typeof avatarUrl === 'string' ? avatarUrl : null);

  const { entity } = useQueryEntity({ id: rowEntityId, spaceId: entitySpaceId, enabled });
  const createdAtSec = parseEntityUpdatedAtToUnixSec(
    entity?.createdAt != null ? String(entity.createdAt) : undefined
  );

  const hideSpaceLink = entitySpaceId === blockSpaceId;
  const { space } = useSpace(hideSpaceLink ? undefined : entitySpaceId);

  const { data: commentCount = 0 } = useQuery({
    queryKey: ['entity-backlink-count', rowEntityId],
    queryFn: async () => {
      const backlinks = await Effect.runPromise(getEntityBacklinks(rowEntityId));
      return backlinks.length;
    },
    staleTime: 60_000,
    enabled,
  });

  return {
    entityId: rowEntityId,
    spaceId: entitySpaceId,
    spaceName: space?.entity.name ?? '',
    spaceImage: space?.entity.image ?? null,
    types: types.map(t => ({ id: t.id, name: t.name })),
    createdAtSec,
    title: name?.trim() || 'Untitled',
    description: description?.trim() || null,
    imageUrl,
    commentCount,
    isMemberOrEditor: true,
    hasPendingMembershipRequest: false,
  };
}

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
  const hideSpaceLink = entitySpaceId === blockSpaceId;
  const showPlaceholderPicker = isEditing && isPlaceholder && source.type === 'COLLECTION';

  const item = useExploreFeedItem({
    rowEntityId,
    entitySpaceId,
    blockSpaceId,
    columns,
    enabled: !showPlaceholderPicker,
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

  return <ExploreFeedCard item={item} hideSpaceLink={hideSpaceLink} hideJoinButton />;
}
