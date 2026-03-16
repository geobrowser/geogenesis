import { Effect } from 'effect';

import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import type { Proposal } from '~/core/io/dto/proposals';
import type { Space } from '~/core/io/dto/spaces';
import { getEntity, getEntityBacklinks, getSpace, getSpaces } from '~/core/io/queries';
import { isTopicSubspaceActionType } from '~/core/io/rest';
import type { Entity } from '~/core/types';
import { Entities } from '~/core/utils/entity';

import { NativeGeoImage } from '~/design-system/geo-image';
import { EditSmall } from '~/design-system/icons/edit-small';
import { Member } from '~/design-system/icons/member';
import { RightArrowLong } from '~/design-system/icons/right-arrow-long';

interface Props {
  proposal: Proposal;
}

type AssociatedSpace = {
  id: string;
  name: string;
  image: string;
  editorsCount: number;
  membersCount: number;
};

export async function SubspaceProposal({ proposal }: Props) {
  const subspaceDetails = proposal.subspaceDetails;

  if (!subspaceDetails) {
    return null;
  }

  const isTopicProposal = isTopicSubspaceActionType(subspaceDetails.actionType);

  const [sourceSpace, targetSpace, topic, associatedSpaces] = await Promise.all([
    Effect.runPromise(getSpace(proposal.space.id)),
    Effect.runPromise(getSpace(subspaceDetails.targetSpaceId)),
    subspaceDetails.targetTopicId
      ? Effect.runPromise(getEntity(subspaceDetails.targetTopicId, proposal.space.id))
      : null,
    isTopicProposal && subspaceDetails.targetTopicId
      ? fetchAssociatedSpaces(subspaceDetails.targetTopicId, subspaceDetails.targetSpaceId)
      : Promise.resolve([]),
  ]);

  const heroTitle = isTopicProposal
    ? (topic?.name ?? subspaceDetails.targetTopicId ?? subspaceDetails.targetSpaceId)
    : (targetSpace?.entity.name ?? subspaceDetails.targetSpaceId);
  const heroImage = isTopicProposal ? entityImage(topic) : spaceImage(targetSpace);
  const changeLabel = proposalActionLabel(subspaceDetails.actionType);
  const changeValue = proposalActionValue({
    actionType: subspaceDetails.actionType,
    sourceSpaceName: sourceSpace?.entity.name ?? proposal.space.id,
    targetSpaceName: targetSpace?.entity.name ?? subspaceDetails.targetSpaceId,
    topicName: topic?.name ?? subspaceDetails.targetTopicId,
  });

  return (
    <div className="flex w-full justify-center">
      <div className="mt-24 w-full max-w-[860px] px-6 pb-24">
        <div className="flex flex-col items-center gap-5">
          <div className="shadow-sm size-20 overflow-hidden rounded-xl border border-grey-02 bg-grey-01">
            <NativeGeoImage
              value={heroImage}
              alt={`Image for ${heroTitle}`}
              className="h-full w-full rounded-xl object-cover"
            />
          </div>

          <h2 className="max-w-[400px] text-center text-mainPage text-text">{heroTitle}</h2>
        </div>

        <div className="mx-auto mt-9 w-full max-w-[400px] border-t border-grey-02">
          <div className="flex items-center justify-between gap-6 border-b border-grey-02 py-4">
            <p className="text-metadata text-text">{changeLabel}</p>
            <div className="flex items-center gap-2 text-metadata text-text">{changeValue}</div>
          </div>

          {isTopicProposal ? (
            <div className="py-4">
              <p className="text-metadata text-text">Associated spaces</p>

              <div className="mt-6 flex flex-col gap-5">
                {associatedSpaces.length > 0 ? (
                  associatedSpaces.map(space => <AssociatedSpaceRow key={space.id} space={space} />)
                ) : (
                  <p className="text-metadata text-grey-04">No associated spaces found yet.</p>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function AssociatedSpaceRow({ space }: { space: AssociatedSpace }) {
  return (
    <div className="flex items-start gap-2">
      <div className="mt-0.5 size-4 overflow-hidden rounded-[4px] border border-grey-02 bg-grey-01">
        <NativeGeoImage
          value={space.image}
          alt={`Image for ${space.name}`}
          className="h-full w-full rounded-[4px] object-cover"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <p className="text-button text-text">{space.name}</p>
        <div className="flex flex-wrap items-center gap-2 text-metadata text-grey-04">
          <span className="inline-flex items-center gap-1.5">
            <EditSmall color="grey-04" />
            {space.editorsCount} editors
          </span>
          <span>·</span>
          <span className="inline-flex items-center gap-1.5">
            <Member color="grey-04" />
            {space.membersCount} members
          </span>
        </div>
      </div>
    </div>
  );
}

async function fetchAssociatedSpaces(topicId: string, targetSpaceId: string): Promise<AssociatedSpace[]> {
  const backlinks = await Effect.runPromise(getEntityBacklinks(topicId));

  if (backlinks.length === 0) {
    return [];
  }

  const uniqueSpaceIds = Array.from(new Set(backlinks.map(backlink => backlink.backlinkSpaceId).filter(Boolean)));

  if (uniqueSpaceIds.length === 0) {
    return [];
  }

  const spaces = await Effect.runPromise(getSpaces({ spaceIds: uniqueSpaceIds }));

  return spaces
    .filter(space => space.id !== targetSpaceId)
    .map(space => ({
      id: space.id,
      name: space.entity.name ?? space.id,
      image: space.entity.image ?? PLACEHOLDER_SPACE_IMAGE,
      editorsCount: space.editors.length,
      membersCount: space.members.length,
    }));
}

function proposalActionLabel(actionType: NonNullable<Proposal['subspaceDetails']>['actionType']) {
  switch (actionType) {
    case 'SUBSPACE_VERIFIED':
    case 'SUBSPACE_UNVERIFIED':
      return 'Verified subspace change';
    case 'SUBSPACE_RELATED':
    case 'SUBSPACE_UNRELATED':
      return 'Related subspace change';
    case 'SUBSPACE_TOPIC_DECLARED':
    case 'SUBSPACE_TOPIC_REMOVED':
      return 'Space topic change';
  }
}

function proposalActionValue({
  actionType,
  sourceSpaceName,
  targetSpaceName,
  topicName,
}: {
  actionType: NonNullable<Proposal['subspaceDetails']>['actionType'];
  sourceSpaceName: string;
  targetSpaceName: string;
  topicName?: string;
}) {
  switch (actionType) {
    case 'SUBSPACE_VERIFIED':
    case 'SUBSPACE_UNVERIFIED':
    case 'SUBSPACE_RELATED':
    case 'SUBSPACE_UNRELATED':
      return (
        <>
          <span>{sourceSpaceName}</span>
          <RightArrowLong color="grey-04" />
          <span>{targetSpaceName}</span>
        </>
      );
    case 'SUBSPACE_TOPIC_DECLARED':
    case 'SUBSPACE_TOPIC_REMOVED':
      return (
        <>
          <span>{topicName ?? 'Topic'}</span>
          <RightArrowLong color="grey-04" />
          <span>{targetSpaceName}</span>
        </>
      );
  }
}

function entityImage(entity: Entity | null): string {
  return Entities.avatar(entity?.relations) ?? Entities.cover(entity?.relations) ?? PLACEHOLDER_SPACE_IMAGE;
}

function spaceImage(space: Space | null): string {
  return space?.entity.image || entityImage(space?.entity ?? null) || PLACEHOLDER_SPACE_IMAGE;
}
