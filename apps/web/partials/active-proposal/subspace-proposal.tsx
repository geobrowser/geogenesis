import { Effect } from 'effect';

import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import { Environment } from '~/core/environment';
import { uuidToHex } from '~/core/id/normalize';
import type { Proposal } from '~/core/io/dto/proposals';
import type { Space } from '~/core/io/dto/spaces';
import { getSpace } from '~/core/io/queries';
import { isTopicSubspaceActionType } from '~/core/io/rest';
import { graphql } from '~/core/io/subgraph/graphql';
import {
  AVATAR_PROPERTY_ID,
  COVER_PROPERTY_ID,
  IMAGE_URL_PROPERTY_ID,
  type SpaceImageRelationNode,
  resolveSpaceImage,
} from '~/core/io/subgraph/space-image';
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

type TopicProposalMetadata = {
  id: string;
  name: string | null;
  image: string;
  associatedSpaces: AssociatedSpace[];
};

type TopicProposalMetadataResult = {
  entity: {
    id: string;
    name: string | null;
    relationsList: SpaceImageRelationNode[];
    spacesByTopicId: Array<{
      id: string;
      membersList: Array<{ memberSpaceId: string }>;
      editorsList: Array<{ memberSpaceId: string }>;
      page: {
        name: string | null;
        relationsList: SpaceImageRelationNode[];
      } | null;
    }>;
  } | null;
};

export async function SubspaceProposal({ proposal }: Props) {
  const subspaceDetails = proposal.subspaceDetails;

  if (!subspaceDetails) {
    return null;
  }

  const isTopicProposal = isTopicSubspaceActionType(subspaceDetails.actionType) && 'targetTopicId' in subspaceDetails;
  const targetSpaceId = 'targetSpaceId' in subspaceDetails ? subspaceDetails.targetSpaceId : proposal.space.id;

  const [sourceSpace, targetSpace, topicMetadata] = await Promise.all([
    Effect.runPromise(getSpace(proposal.space.id)),
    isTopicProposal ? Promise.resolve(null) : Effect.runPromise(getSpace(targetSpaceId)),
    isTopicProposal && subspaceDetails.targetTopicId
      ? fetchTopicProposalMetadata(subspaceDetails.targetTopicId)
      : Promise.resolve(null),
  ]);

  const heroTitle = isTopicProposal
    ? (topicMetadata?.name ?? subspaceDetails.targetTopicId)
    : (targetSpace?.entity.name ??
      ('targetSpaceId' in subspaceDetails ? subspaceDetails.targetSpaceId : targetSpaceId));
  const heroImage = isTopicProposal ? (topicMetadata?.image ?? PLACEHOLDER_SPACE_IMAGE) : spaceImage(targetSpace);
  const changeLabel = proposalActionLabel(subspaceDetails.actionType);
  const changeValue = proposalActionValue({
    actionType: subspaceDetails.actionType,
    sourceSpaceName: sourceSpace?.entity.name ?? proposal.space.id,
    targetSpaceName: targetSpace?.entity.name ?? targetSpaceId,
    topicName: isTopicProposal ? (topicMetadata?.name ?? subspaceDetails.targetTopicId) : undefined,
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
                {topicMetadata?.associatedSpaces.length ? (
                  topicMetadata.associatedSpaces.map(space => <AssociatedSpaceRow key={space.id} space={space} />)
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

async function fetchTopicProposalMetadata(topicId: string): Promise<TopicProposalMetadata | null> {
  const normalizedTopicId = uuidToHex(topicId);
  const result = await Effect.runPromise(
    graphql<TopicProposalMetadataResult>({
      endpoint: Environment.getConfig().api,
      query: `
        {
          entity(id: ${JSON.stringify(normalizedTopicId)}) {
            id
            name
            relationsList(filter: { typeId: { in: [${JSON.stringify(AVATAR_PROPERTY_ID)}, ${JSON.stringify(COVER_PROPERTY_ID)}] } }) {
              typeId
              toEntity {
                valuesList(filter: { propertyId: { is: ${JSON.stringify(IMAGE_URL_PROPERTY_ID)} } }) {
                  propertyId
                  text
                }
              }
            }
            spacesByTopicId {
              id
              membersList {
                memberSpaceId
              }
              editorsList {
                memberSpaceId
              }
              page {
                name
                relationsList(filter: { typeId: { in: [${JSON.stringify(AVATAR_PROPERTY_ID)}, ${JSON.stringify(COVER_PROPERTY_ID)}] } }) {
                  typeId
                  toEntity {
                    valuesList(filter: { propertyId: { is: ${JSON.stringify(IMAGE_URL_PROPERTY_ID)} } }) {
                      propertyId
                      text
                    }
                  }
                }
              }
            }
          }
        }
      `,
    })
  );

  if (!result.entity) {
    return null;
  }

  return {
    id: result.entity.id,
    name: result.entity.name,
    image: resolveSpaceImage(result.entity.relationsList),
    associatedSpaces: result.entity.spacesByTopicId.map(space => ({
      id: space.id,
      name: space.page?.name ?? space.id,
      image: resolveSpaceImage(space.page?.relationsList ?? []),
      editorsCount: space.editorsList.length,
      membersCount: space.membersList.length,
    })),
  };
}

function proposalActionLabel(actionType: NonNullable<Proposal['subspaceDetails']>['actionType']) {
  switch (actionType) {
    case 'SUBSPACE_VERIFIED':
      return 'Add verified space';
    case 'SUBSPACE_UNVERIFIED':
      return 'Remove verified space';
    case 'SUBSPACE_RELATED':
      return 'Add related space';
    case 'SUBSPACE_UNRELATED':
      return 'Remove related space';
    case 'SUBSPACE_TOPIC_DECLARED':
      return 'Add subtopic';
    case 'SUBSPACE_TOPIC_REMOVED':
      return 'Remove subtopic';
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
          <span>{sourceSpaceName}</span>
          <RightArrowLong color="grey-04" />
          <span>{topicName ?? 'Topic'}</span>
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
