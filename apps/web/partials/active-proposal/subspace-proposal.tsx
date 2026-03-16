import { Effect } from 'effect';

import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import { Proposal } from '~/core/io/dto/proposals';
import { getEntity, getSpace } from '~/core/io/queries';
import { isTopicSubspaceActionType } from '~/core/io/rest';
import type { Entity } from '~/core/types';
import { Entities } from '~/core/utils/entity';

import { GeoImage } from '~/design-system/geo-image';
import { EditSmall } from '~/design-system/icons/edit-small';
import { Member } from '~/design-system/icons/member';

interface Props {
  proposal: Proposal;
}

type CardData = {
  label: string;
  title: string;
  image: string;
  subtitle?: string;
  editorsCount?: number;
  membersCount?: number;
};

export async function SubspaceProposal({ proposal }: Props) {
  const subspaceDetails = proposal.subspaceDetails;

  if (!subspaceDetails) {
    return null;
  }

  const [sourceSpace, targetSpace, topic] = await Promise.all([
    Effect.runPromise(getSpace(proposal.space.id)),
    Effect.runPromise(getSpace(subspaceDetails.targetSpaceId)),
    subspaceDetails.targetTopicId
      ? Effect.runPromise(getEntity(subspaceDetails.targetTopicId, proposal.space.id))
      : null,
  ]);

  const cards: CardData[] = [
    {
      label: 'Source space',
      title: sourceSpace?.entity.name ?? proposal.space.id,
      image: sourceSpace?.entity.image ?? PLACEHOLDER_SPACE_IMAGE,
      editorsCount: sourceSpace?.editors.length,
      membersCount: sourceSpace?.members.length,
    },
    {
      label: 'Target subspace',
      title: targetSpace?.entity.name ?? subspaceDetails.targetSpaceId,
      image: targetSpace?.entity.image ?? PLACEHOLDER_SPACE_IMAGE,
      subtitle: sourceSpace?.entity.name ? `Within ${sourceSpace.entity.name}` : undefined,
      editorsCount: targetSpace?.editors.length,
      membersCount: targetSpace?.members.length,
    },
  ];

  if (isTopicSubspaceActionType(subspaceDetails.actionType) && subspaceDetails.targetTopicId) {
    cards.push({
      label: 'Target topic',
      title: topic?.name ?? subspaceDetails.targetTopicId,
      image: entityImage(topic),
      subtitle: targetSpace?.entity.name ? `Attached to ${targetSpace.entity.name}` : undefined,
    });
  }

  return (
    <div className="flex w-full justify-center">
      <div className="mt-20 flex w-[585px] flex-col gap-4 rounded-lg border border-grey-02 p-5">
        <div className="space-y-2">
          <p className="text-metadataMedium text-grey-04">{proposalActionLabel(subspaceDetails.actionType)}</p>
          <h2 className="text-mainPage break-all">{targetSpace?.entity.name ?? subspaceDetails.targetSpaceId}</h2>
          <p className="text-metadataMedium text-grey-04">
            Generic verification UI for resolved subspace proposal targets.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          {cards.map(card => (
            <ProposalTargetCard key={card.label} card={card} />
          ))}
        </div>
      </div>
    </div>
  );
}

function ProposalTargetCard({ card }: { card: CardData }) {
  return (
    <div className="rounded-lg border border-grey-02 bg-grey-01 p-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="relative h-12 w-12 overflow-hidden rounded-md border border-white">
            <GeoImage
              value={card.image}
              alt={`Image for ${card.title}`}
              className="h-12 w-12 rounded-md"
              style={{ objectFit: 'cover' }}
              fill
            />
          </div>
          <div className="flex flex-col gap-1">
            <p className="text-metadataMedium text-grey-04">{card.label}</p>
            <p className="text-smallTitle break-all">{card.title}</p>
            {card.subtitle ? <p className="text-metadataMedium text-grey-04">{card.subtitle}</p> : null}
          </div>
        </div>

        {card.editorsCount !== undefined || card.membersCount !== undefined ? (
          <div className="flex items-center gap-2">
            {card.editorsCount !== undefined ? (
              <div className="flex h-6 items-center gap-1 rounded-sm bg-divider px-1.5 text-breadcrumb text-text">
                <EditSmall color="grey-04" />
                {card.editorsCount}
              </div>
            ) : null}
            {card.membersCount !== undefined ? (
              <div className="flex h-6 items-center gap-1 rounded-sm bg-divider px-1.5 text-breadcrumb text-text">
                <Member color="grey-04" />
                {card.membersCount}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function proposalActionLabel(actionType: NonNullable<Proposal['subspaceDetails']>['actionType']) {
  switch (actionType) {
    case 'SUBSPACE_VERIFIED':
      return 'Verify subspace';
    case 'SUBSPACE_UNVERIFIED':
      return 'Remove verified subspace';
    case 'SUBSPACE_RELATED':
      return 'Add related subspace';
    case 'SUBSPACE_UNRELATED':
      return 'Remove related subspace';
    case 'SUBSPACE_TOPIC_DECLARED':
      return 'Add subtopic';
    case 'SUBSPACE_TOPIC_REMOVED':
      return 'Remove subtopic';
  }
}

function entityImage(entity: Entity | null): string {
  return Entities.avatar(entity?.relations) ?? Entities.cover(entity?.relations) ?? PLACEHOLDER_SPACE_IMAGE;
}
