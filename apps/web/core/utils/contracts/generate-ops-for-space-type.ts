import { Account, CONTENT_IDS, Image, Op, Relation, SYSTEM_IDS } from '@geogenesis/sdk';

import { ID } from '~/core/id';
import type { SpaceType } from '~/core/types';
import { generateOpsForCompany } from '~/core/utils/contracts/generate-ops-for-company';
import { generateOpsForNonprofit } from '~/core/utils/contracts/generate-ops-for-nonprofit';
import { generateOpsForPerson } from '~/core/utils/contracts/generate-ops-for-person';
import { Ops } from '~/core/utils/ops';

type DeployArgs = {
  type: SpaceType;
  spaceName: string;
  spaceAvatarUri: string | null;
  spaceCoverUri: string | null;
  initialEditorAddress: string;
};

export const generateOpsForSpaceType = async ({
  type,
  spaceName,
  spaceAvatarUri,
  spaceCoverUri,
  initialEditorAddress,
}: DeployArgs) => {
  const ops: Op[] = [];
  const newEntityId = ID.createEntityId();

  // Add name for all space types
  ops.push(
    Ops.create({
      entity: newEntityId,
      attribute: SYSTEM_IDS.NAME_ATTRIBUTE,
      value: {
        type: 'TEXT',
        value: spaceName,
      },
    })
  );

  // Add the space configuration type to every deployed space entity
  ops.push(
    Relation.make({
      fromId: newEntityId,
      toId: SYSTEM_IDS.SPACE_CONFIGURATION,
      relationTypeId: SYSTEM_IDS.TYPES_ATTRIBUTE,
    })
  );

  // Add space type-specific ops
  switch (type) {
    case 'personal': {
      const personOps = await generateOpsForPerson(newEntityId, spaceName);
      ops.push(...personOps);

      const { accountId, ops: accountOps } = Account.make(initialEditorAddress);

      ops.push(...accountOps);
      ops.push(
        Relation.make({
          fromId: newEntityId,
          relationTypeId: SYSTEM_IDS.ACCOUNTS_ATTRIBUTE,
          toId: accountId,
        })
      );

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
    case 'academic-field':
      ops.push(
        Relation.make({
          fromId: newEntityId,
          toId: SYSTEM_IDS.ACADEMIC_FIELD_TYPE,
          relationTypeId: SYSTEM_IDS.TYPES_ATTRIBUTE,
        })
      );
      break;
    case 'dao':
      ops.push(
        Relation.make({
          fromId: newEntityId,
          toId: SYSTEM_IDS.DAO_TYPE,
          relationTypeId: SYSTEM_IDS.TYPES_ATTRIBUTE,
        })
      );
      break;
    case 'government-org':
      ops.push(
        Relation.make({
          fromId: newEntityId,
          toId: SYSTEM_IDS.GOVERNMENT_ORG_TYPE,
          relationTypeId: SYSTEM_IDS.TYPES_ATTRIBUTE,
        })
      );
      break;
    case 'industry':
      ops.push(
        Relation.make({
          fromId: newEntityId,
          toId: SYSTEM_IDS.INDUSTRY_TYPE,
          relationTypeId: SYSTEM_IDS.TYPES_ATTRIBUTE,
        })
      );
      break;
    case 'interest-group':
      ops.push(
        Relation.make({
          fromId: newEntityId,
          toId: SYSTEM_IDS.INTEREST_GROUP_TYPE,
          relationTypeId: SYSTEM_IDS.TYPES_ATTRIBUTE,
        })
      );
      break;
    case 'protocol':
      ops.push(
        Relation.make({
          fromId: newEntityId,
          toId: SYSTEM_IDS.PROTOCOL_TYPE,
          relationTypeId: SYSTEM_IDS.TYPES_ATTRIBUTE,
        })
      );
      break;
    case 'region':
      ops.push(
        Relation.make({
          fromId: newEntityId,
          toId: SYSTEM_IDS.REGION_TYPE,
          relationTypeId: SYSTEM_IDS.TYPES_ATTRIBUTE,
        })
      );
      break;
    default:
      break;
  }

  if (spaceAvatarUri) {
    const { imageId, ops: imageOps } = Image.make(spaceAvatarUri);

    // Creates the image entity
    ops.push(...imageOps);

    // Creates the relation pointing to the image entity
    ops.push(
      Relation.make({
        fromId: newEntityId,
        toId: imageId, // Set the avatar relation to point to the entity id of the new entity
        relationTypeId: CONTENT_IDS.AVATAR_ATTRIBUTE,
      })
    );
  }

  if (spaceCoverUri) {
    const { imageId, ops: imageOps } = Image.make(spaceCoverUri);

    // Creates the image entity
    ops.push(...imageOps);

    // Creates the relation pointing to the image entity
    ops.push(
      Relation.make({
        fromId: newEntityId,
        toId: imageId, // Set the avatar relation to point to the entity id of the new entity
        relationTypeId: SYSTEM_IDS.COVER_ATTRIBUTE,
      })
    );
  }

  return ops;
};
