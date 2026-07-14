import { Position, SystemIds } from '@geoprotocol/geo-sdk/lite';

import { ID } from '~/core/id';
import type { Relation } from '~/core/types';

import { CLAIM_TYPE_ID, TOPICS_PROPERTY_ID } from './ontology';

export type ClaimDraftSelection = {
  id: string;
  name: string | null;
};

export type BuildClaimDraftInput = {
  spaceId: string;
  claimText: string;
  topics?: ClaimDraftSelection[];
};

export type ClaimDraft = {
  claimId: string;
  names: Array<{ entityId: string; spaceId: string; value: string }>;
  relations: Relation[];
};

type BuildClaimDraftOptions = {
  createEntityId?: () => string;
  createPosition?: () => string;
};

export function buildClaimDraft(input: BuildClaimDraftInput, options: BuildClaimDraftOptions = {}): ClaimDraft {
  const createEntityId = options.createEntityId ?? ID.createEntityId;
  const createPosition = options.createPosition ?? Position.generate;
  const claimText = input.claimText.trim();

  if (claimText.length === 0) {
    throw new Error('Claim text is required.');
  }

  const claimId = createEntityId();
  const names: ClaimDraft['names'] = [{ entityId: claimId, spaceId: input.spaceId, value: claimText }];
  const relations: Relation[] = [];

  const makeRelation = ({
    propertyId,
    propertyName,
    toEntityId,
    toEntityName,
  }: {
    propertyId: string;
    propertyName: string;
    toEntityId: string;
    toEntityName: string | null;
  }): Relation => ({
    id: createEntityId(),
    entityId: createEntityId(),
    spaceId: input.spaceId,
    renderableType: 'RELATION',
    verified: false,
    position: createPosition(),
    type: {
      id: propertyId,
      name: propertyName,
    },
    fromEntity: {
      id: claimId,
      name: claimText,
    },
    toEntity: {
      id: toEntityId,
      name: toEntityName,
      value: toEntityId,
    },
  });

  relations.push(
    makeRelation({
      propertyId: SystemIds.TYPES_PROPERTY,
      propertyName: 'Types',
      toEntityId: CLAIM_TYPE_ID,
      toEntityName: 'Claim',
    })
  );

  for (const topic of input.topics ?? []) {
    relations.push(
      makeRelation({
        propertyId: TOPICS_PROPERTY_ID,
        propertyName: 'Topics',
        toEntityId: topic.id,
        toEntityName: topic.name,
      })
    );
  }

  return { claimId, names, relations };
}
