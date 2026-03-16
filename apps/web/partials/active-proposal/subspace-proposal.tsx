import { Effect } from 'effect';

import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import { Proposal } from '~/core/io/dto/proposals';
import { getEntity, getSpace } from '~/core/io/queries';
import { isAddSubspaceActionType, isTopicSubspaceActionType } from '~/core/io/rest';
import type { Entity } from '~/core/types';
import { Entities } from '~/core/utils/entity';

import { GeoImage } from '~/design-system/geo-image';
import { AddTo } from '~/design-system/icons/add-to';
import { EditSmall } from '~/design-system/icons/edit-small';
import { Member } from '~/design-system/icons/member';

interface Props {
  proposal: Proposal;
}

export async function SubspaceProposal({ proposal }: Props) {
  const subspaceDetails = proposal.subspaceDetails;

  if (!subspaceDetails) {
    return null;
  }

  if (isTopicSubspaceActionType(subspaceDetails.actionType)) {
    return <SubspaceTopicProposal proposal={proposal} />;
  }

  const [subspace, space] = await Promise.all([
    Effect.runPromise(getSpace(subspaceDetails.targetSpaceId)),
    Effect.runPromise(getSpace(proposal.space.id)),
  ]);

  if (!subspace) {
    return null;
  }

  const isAddSubspace = isAddSubspaceActionType(subspaceDetails.actionType);

  return (
    <div className="flex w-full justify-center">
      <div className="mt-20 flex w-[585px] flex-col items-center rounded-lg border border-grey-02 p-5">
        <div className="flex w-full flex-col gap-5 divide-y divide-grey-02">
          <div className="flex w-full flex-col items-center gap-6">
            <div className="relative h-[72px] w-[72px] overflow-hidden rounded-lg border border-white object-cover shadow-lg">
              <GeoImage
                value={space?.entity?.image ?? PLACEHOLDER_SPACE_IMAGE}
                alt={`Space cover image for ${space?.entity?.name ?? space?.id}`}
                className="h-[72px] w-[72px] rounded-lg"
                style={{ objectFit: 'cover' }}
                fill
              />
            </div>
            <div className="space-y-5">
              <h2 className="text-mainPage break-all">{space?.entity?.name ?? space?.id}</h2>
              <div className="flex items-center justify-center gap-2">
                <span className="flex h-6 items-center rounded-sm bg-text px-1.5 text-breadcrumb text-white">
                  Space
                </span>
                <div className="flex h-6 items-center gap-1 rounded-sm bg-divider px-1.5 text-breadcrumb text-text">
                  <EditSmall color="grey-04" />
                  {space?.editors.length}
                </div>
                <div className="flex h-6 items-center gap-1 rounded-sm bg-divider px-1.5 text-breadcrumb text-text">
                  <Member color="grey-04" />
                  {space?.members.length}
                </div>
              </div>
            </div>
          </div>
          <div className="flex w-full flex-col gap-3">
            <p className="mt-5 text-metadataMedium text-grey-04">
              {isAddSubspace ? 'Add subspace' : 'Remove subspace'}
            </p>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="-mt-1">
                  <AddTo color="grey-04" />
                </div>

                <div className="flex items-center gap-2">
                  <div className="relative h-4 w-4 overflow-hidden rounded-sm object-cover">
                    <GeoImage
                      value={subspace.entity.image ?? PLACEHOLDER_SPACE_IMAGE}
                      alt={`Space cover image for ${subspace.entity.name ?? subspace.id}`}
                      className="h-4 w-4 rounded-sm"
                      style={{ objectFit: 'cover' }}
                      fill
                    />
                  </div>
                </div>
                <p className="text-smallTitle">{subspace.entity.name ?? subspace.id}</p>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex h-6 items-center gap-1 rounded-sm bg-divider px-1.5 text-breadcrumb text-text">
                  <EditSmall color="grey-04" />
                  {subspace.editors.length}
                </div>
                <div className="flex h-6 items-center gap-1 rounded-sm bg-divider px-1.5 text-breadcrumb text-text">
                  <Member color="grey-04" />
                  {subspace.members.length}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

async function SubspaceTopicProposal({ proposal }: Props) {
  const subspaceDetails = proposal.subspaceDetails;

  if (!subspaceDetails || !isTopicSubspaceActionType(subspaceDetails.actionType) || !subspaceDetails.targetTopicId) {
    return null;
  }

  const [space, subspace, topic] = await Promise.all([
    Effect.runPromise(getSpace(proposal.space.id)),
    Effect.runPromise(getSpace(subspaceDetails.targetSpaceId)),
    Effect.runPromise(getEntity(subspaceDetails.targetTopicId, proposal.space.id)),
  ]);

  const isAddTopic = isAddSubspaceActionType(subspaceDetails.actionType);
  const topicImage = entityImage(topic);

  return (
    <div className="flex w-full justify-center">
      <div className="mt-20 flex w-[585px] flex-col gap-4 rounded-lg border border-grey-02 p-5">
        <div className="flex flex-col gap-2">
          <p className="text-metadataMedium text-grey-04">{isAddTopic ? 'Add subtopic' : 'Remove subtopic'}</p>
          <h2 className="text-smallTitle">{subspace?.entity?.name ?? subspaceDetails.targetSpaceId}</h2>
        </div>

        <div className="rounded-lg bg-grey-01 p-4">
          <div className="flex items-center gap-3">
            <div className="relative h-10 w-10 overflow-hidden rounded-md border border-white">
              <GeoImage
                value={topicImage}
                alt={`Topic image for ${topic?.name ?? subspaceDetails.targetTopicId}`}
                className="h-10 w-10 rounded-md"
                style={{ objectFit: 'cover' }}
                fill
              />
            </div>
            <div className="flex flex-col gap-1">
              <p className="text-metadataMedium text-grey-04">Topic</p>
              <p className="text-smallTitle">{topic?.name ?? subspaceDetails.targetTopicId}</p>
            </div>
          </div>
        </div>

        <div className="rounded-lg bg-grey-01 p-4">
          <div className="flex items-center gap-3">
            <div className="relative h-10 w-10 overflow-hidden rounded-md border border-white">
              <GeoImage
                value={subspace?.entity?.image ?? PLACEHOLDER_SPACE_IMAGE}
                alt={`Space cover image for ${subspace?.entity?.name ?? subspaceDetails.targetSpaceId}`}
                className="h-10 w-10 rounded-md"
                style={{ objectFit: 'cover' }}
                fill
              />
            </div>
            <div className="flex flex-col gap-1">
              <p className="text-metadataMedium text-grey-04">Subspace</p>
              <p className="text-smallTitle">{subspace?.entity?.name ?? subspaceDetails.targetSpaceId}</p>
              <p className="text-metadataMedium text-grey-04">Parent: {space?.entity?.name ?? proposal.space.id}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function entityImage(entity: Entity | null): string {
  return Entities.avatar(entity?.relations) ?? Entities.cover(entity?.relations) ?? PLACEHOLDER_SPACE_IMAGE;
}
