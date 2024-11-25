import { Op, SYSTEM_IDS, createImageEntityOps, createRelationship } from '@geogenesis/sdk';

import { ID } from '~/core/id';
import type { SpaceGovernanceType, SpaceType } from '~/core/types';
import { generateOpsForCompany } from '~/core/utils/contracts/generate-ops-for-company';
import { generateOpsForNonprofit } from '~/core/utils/contracts/generate-ops-for-nonprofit';
import { generateOpsForPerson } from '~/core/utils/contracts/generate-ops-for-person';
import { Ops } from '~/core/utils/ops';

type DeployArgs = {
  type: SpaceType;
  governanceType?: SpaceGovernanceType;
  spaceName: string;
  spaceAvatarUri: string | null;
  spaceCoverUri: string | null;
  initialEditorAddress: string;
  baseUrl: string;
};

export const generateOpsForSpaceType = async ({ type, spaceName, spaceAvatarUri, spaceCoverUri }: DeployArgs) => {
  const ops: Op[] = [];
  const newEntityId = ID.createEntityId();

  // Add name for all space types
  ops.push(
    Ops.create({
      entity: newEntityId,
      attribute: SYSTEM_IDS.NAME,
      value: {
        type: 'TEXT',
        value: spaceName,
      },
    })
  );

  // Add space type-specific ops
  switch (type) {
    case 'default': {
      ops.push(
        ...createRelationship({
          fromId: newEntityId,
          toId: SYSTEM_IDS.SPACE_CONFIGURATION,
          relationTypeId: SYSTEM_IDS.TYPES,
        })
      );
      break;
    }
    case 'personal': {
      const personOps = await generateOpsForPerson(newEntityId, spaceName);
      ops.push(...personOps);
      break;
    }
    case 'company': {
      const companyOps = await generateOpsForCompany(newEntityId, spaceName);
      ops.push(...companyOps);
      break;
    }
    case 'nonprofit': {
      const nonprofitOps = await generateOpsForNonprofit(newEntityId, spaceName);
      ops.push(...nonprofitOps);
      break;
    }
  }

  if (spaceAvatarUri) {
    const imageOps = createImageEntityOps(spaceAvatarUri);

    // Creates the image entity
    ops.push(...imageOps);

    // Creates the relation pointing to the image entity
    ops.push(
      ...createRelationship({
        fromId: newEntityId,
        toId: imageOps[0].triple.entity, // Set the avatar relation to point to the entity id of the new entity
        relationTypeId: SYSTEM_IDS.AVATAR_ATTRIBUTE,
      })
    );
  }

  if (spaceCoverUri) {
    const [typeOp, srcOp] = createImageEntityOps(spaceCoverUri);

    // Creates the image entity
    ops.push(typeOp);
    ops.push(srcOp);

    // Creates the relation pointing to the image entity
    ops.push(
      ...createRelationship({
        fromId: newEntityId,
        toId: typeOp.triple.entity, // Set the avatar relation to point to the entity id of the new entity
        relationTypeId: SYSTEM_IDS.COVER_ATTRIBUTE,
      })
    );
  }

  return ops;
};
