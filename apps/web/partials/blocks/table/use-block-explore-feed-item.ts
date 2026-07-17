'use client';

import { SystemIds } from '@geoprotocol/geo-sdk/lite';
import { useQuery } from '@tanstack/react-query';

import { Effect } from 'effect';

import { getRecordingUrls } from '~/core/community-calls/recordings';
import { DEBATE_VIDEOS_PROPERTY_ID } from '~/core/debates/ontology';
import { parseEntityUpdatedAtToUnixSec } from '~/core/explore/explore-relative-time';
import type { ExploreFeedItem } from '~/core/explore/fetch-explore-feed';
import { useSpace } from '~/core/hooks/use-space';
import { getEntity, getEntityBacklinks } from '~/core/io/queries';
import {
  useAvatar,
  useCover,
  useDescription,
  useEntityTypes,
  useName,
} from '~/core/state/entity-page-store/entity-store';
import { useQueryEntity } from '~/core/sync/use-store';
import type { Cell } from '~/core/types';
import { getRelationVideoUrls } from '~/core/utils/relation-video';
import { useImageUrlFromEntity } from '~/core/utils/use-entity-media';

function entityCreatedAtSec(entity: { createdAt?: string | number; updatedAt?: string | number } | null | undefined) {
  return (
    parseEntityUpdatedAtToUnixSec(entity?.updatedAt != null ? String(entity.updatedAt) : undefined) ||
    parseEntityUpdatedAtToUnixSec(entity?.createdAt != null ? String(entity.createdAt) : undefined)
  );
}

export function useBlockExploreFeedItem({
  rowEntityId,
  entitySpaceId,
  blockSpaceId,
  columns,
  titleOverride,
  descriptionOverride,
  imageHintOverride,
  enabled = true,
  isMemberOrEditor = false,
}: {
  rowEntityId: string;
  entitySpaceId: string;
  blockSpaceId: string;
  columns?: Record<string, Cell>;
  titleOverride?: string | null;
  descriptionOverride?: string | null;
  imageHintOverride?: string | null;
  enabled?: boolean;
  isMemberOrEditor?: boolean;
}): ExploreFeedItem {
  const nameCell = columns?.[SystemIds.NAME_PROPERTY];
  const types = useEntityTypes(rowEntityId);
  const name = useName(rowEntityId, entitySpaceId);
  const description = useDescription(rowEntityId, entitySpaceId);
  const avatarUrl = useAvatar(rowEntityId, entitySpaceId);
  const coverUrl = useCover(rowEntityId, entitySpaceId);
  const directIpfs =
    imageHintOverride && typeof imageHintOverride === 'string' && imageHintOverride.startsWith('ipfs://')
      ? imageHintOverride
      : undefined;
  const lookedUpFromHint = useImageUrlFromEntity(
    imageHintOverride && !directIpfs ? imageHintOverride : undefined,
    blockSpaceId
  );
  const imageUrl =
    directIpfs ??
    lookedUpFromHint ??
    (typeof coverUrl === 'string' ? coverUrl : null) ??
    (typeof avatarUrl === 'string' ? avatarUrl : null);

  const { entity: storeEntity } = useQueryEntity({ id: rowEntityId, spaceId: entitySpaceId, enabled });
  const storeCreatedAtSec = entityCreatedAtSec(storeEntity);

  const { data: remoteEntity } = useQuery({
    queryKey: ['network', 'entity', rowEntityId, undefined],
    queryFn: ({ signal }) => Effect.runPromise(getEntity(rowEntityId, undefined, signal)),
    enabled: enabled && storeCreatedAtSec === 0,
    staleTime: 60_000,
  });

  const createdAtSec = storeCreatedAtSec || entityCreatedAtSec(remoteEntity);

  const hideSpaceLink = entitySpaceId === blockSpaceId;
  const { space } = useSpace(hideSpaceLink ? undefined : entitySpaceId);

  const { data: commentCount = 0 } = useQuery({
    queryKey: ['entity-backlink-count', rowEntityId],
    queryFn: async ({ signal }) => {
      const backlinks = await Effect.runPromise(getEntityBacklinks(rowEntityId, undefined, signal));
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
    title:
      titleOverride !== undefined
        ? titleOverride?.trim() || 'Untitled'
        : name?.trim() || nameCell?.name?.trim() || 'Untitled',
    description:
      descriptionOverride !== undefined
        ? descriptionOverride?.trim() || null
        : description?.trim() || nameCell?.description?.trim() || null,
    imageUrl,
    recordingUrls: getRecordingUrls((storeEntity?.relations ?? []).filter(r => r.spaceId === entitySpaceId)),
    debateVideoUrls: getRelationVideoUrls(
      (storeEntity?.relations ?? []).filter(r => r.spaceId === entitySpaceId),
      DEBATE_VIDEOS_PROPERTY_ID
    ),
    commentCount,
    isMemberOrEditor,
    hasPendingMembershipRequest: false,
  };
}
