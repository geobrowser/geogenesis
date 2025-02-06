import { Account, CONTENT_IDS, Image, Op, Relation, SYSTEM_IDS } from '@geogenesis/sdk';

import { ID } from '~/core/id';
import { EntityId } from '~/core/io/schema';
import type { SpaceType } from '~/core/types';
import { cloneEntity } from '~/core/utils/contracts/clone-entity';
import { Ops } from '~/core/utils/ops';
import { validateEntityId } from '~/core/utils/utils';

type DeployArgs = {
  type: SpaceType;
  spaceName: string;
  spaceAvatarUri: string | null;
  spaceCoverUri: string | null;
  initialEditorAddress: string;
  entityId?: string;
};

export const generateOpsForSpaceType = async ({
  type,
  spaceName,
  spaceAvatarUri,
  spaceCoverUri,
  initialEditorAddress,
  entityId,
}: DeployArgs) => {
  const ops: Op[] = [];
  const newEntityId = validateEntityId(entityId) ? (entityId as EntityId) : ID.createEntityId();

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
      toId: SYSTEM_IDS.SPACE_TYPE,
      relationTypeId: SYSTEM_IDS.TYPES_ATTRIBUTE,
    })
  );

  // Add space type-specific ops
  switch (type) {
    case 'personal': {
      const [personOps] = await cloneEntity({
        oldEntityId: SYSTEM_IDS.PERSON_TEMPLATE,
        entityId: newEntityId,
        entityName: spaceName,
      });

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
      const [companyOps] = await cloneEntity({
        oldEntityId: SYSTEM_IDS.COMPANY_TEMPLATE,
        entityId: newEntityId,
        entityName: spaceName,
      });

      ops.push(...companyOps);
      break;
    }
    case 'nonprofit': {
      // @TODO nonprofit template

      break;
    }
    case 'academic-field': {
      const [academicFieldOps] = await cloneEntity({
        oldEntityId: SYSTEM_IDS.ACADEMIC_FIELD_TEMPLATE,
        entityId: newEntityId,
        entityName: spaceName,
      });

      ops.push(...academicFieldOps);
      break;
    }
    case 'dao': {
      const [daoOps] = await cloneEntity({
        oldEntityId: SYSTEM_IDS.DAO_TEMPLATE,
        entityId: newEntityId,
        entityName: spaceName,
      });

      ops.push(...daoOps);
      break;
    }
    case 'government-org':
      // @TODO government org template

      ops.push(
        Relation.make({
          fromId: newEntityId,
          toId: SYSTEM_IDS.GOVERNMENT_ORG_TYPE,
          relationTypeId: SYSTEM_IDS.TYPES_ATTRIBUTE,
        })
      );
      break;
    case 'industry': {
      const [industryOps] = await cloneEntity({
        oldEntityId: SYSTEM_IDS.INDUSTRY_TEMPLATE,
        entityId: newEntityId,
        entityName: spaceName,
      });

      ops.push(...industryOps);
      break;
    }
    case 'interest': {
      const [interestOps] = await cloneEntity({
        oldEntityId: SYSTEM_IDS.INTEREST_TEMPLATE,
        entityId: newEntityId,
        entityName: spaceName,
      });

      ops.push(...interestOps);
      break;
    }
    case 'protocol': {
      const [protocolOps] = await cloneEntity({
        oldEntityId: SYSTEM_IDS.PROTOCOL_TEMPLATE,
        entityId: newEntityId,
        entityName: spaceName,
      });

      ops.push(...protocolOps);

      break;
    }
    case 'region': {
      const [regionOps] = await cloneEntity({
        oldEntityId: SYSTEM_IDS.REGION_TEMPLATE,
        entityId: newEntityId,
        entityName: spaceName,
      });

      ops.push(...regionOps);
      break;
    }
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
