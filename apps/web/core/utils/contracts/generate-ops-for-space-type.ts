import { Account, ContentIds, Image, Op, Relation, SystemIds } from '@graphprotocol/grc-20';

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
      attribute: SystemIds.NAME_PROPERTY,
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
      toId: SystemIds.SPACE_TYPE,
      relationTypeId: SystemIds.TYPES_PROPERTY,
    })
  );

  // Add space type-specific ops
  switch (type) {
    case 'personal': {
      const [personOps] = await cloneEntity({
        oldEntityId: SystemIds.PERSON_TEMPLATE,
        entityId: newEntityId,
        entityName: spaceName,
      });

      ops.push(...personOps);

      const { accountId, ops: accountOps } = Account.make(initialEditorAddress);

      ops.push(...accountOps);

      ops.push(
        Relation.make({
          fromId: newEntityId,
          relationTypeId: SystemIds.ACCOUNTS_PROPERTY,
          toId: accountId,
        })
      );

      break;
    }
    case 'company': {
      const [companyOps] = await cloneEntity({
        oldEntityId: SystemIds.COMPANY_TEMPLATE,
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
        oldEntityId: SystemIds.ACADEMIC_FIELD_TEMPLATE,
        entityId: newEntityId,
        entityName: spaceName,
      });

      ops.push(...academicFieldOps);
      break;
    }
    case 'dao': {
      const [daoOps] = await cloneEntity({
        oldEntityId: SystemIds.DAO_TEMPLATE,
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
          toId: SystemIds.GOVERNMENT_ORG_TYPE,
          relationTypeId: SystemIds.TYPES_PROPERTY,
        })
      );
      break;
    case 'industry': {
      const [industryOps] = await cloneEntity({
        oldEntityId: SystemIds.INDUSTRY_TEMPLATE,
        entityId: newEntityId,
        entityName: spaceName,
      });

      ops.push(...industryOps);
      break;
    }
    case 'interest': {
      const [interestOps] = await cloneEntity({
        oldEntityId: SystemIds.INTEREST_TEMPLATE,
        entityId: newEntityId,
        entityName: spaceName,
      });

      ops.push(...interestOps);
      break;
    }
    case 'protocol': {
      const [protocolOps] = await cloneEntity({
        oldEntityId: SystemIds.PROTOCOL_TEMPLATE,
        entityId: newEntityId,
        entityName: spaceName,
      });

      ops.push(...protocolOps);

      break;
    }
    case 'region': {
      const [regionOps] = await cloneEntity({
        oldEntityId: SystemIds.REGION_TEMPLATE,
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
    const { id: imageId, ops: imageOps } = Image.make({ cid: spaceAvatarUri });

    // Creates the image entity
    ops.push(...imageOps);

    // Creates the relation pointing to the image entity
    ops.push(
      Relation.make({
        fromId: newEntityId,
        toId: imageId, // Set the avatar relation to point to the entity id of the new entity
        relationTypeId: ContentIds.AVATAR_PROPERTY,
      })
    );
  }

  if (spaceCoverUri) {
    const { id: imageId, ops: imageOps } = Image.make({ cid: spaceCoverUri });

    // Creates the image entity
    ops.push(...imageOps);

    // Creates the relation pointing to the image entity
    ops.push(
      Relation.make({
        fromId: newEntityId,
        toId: imageId, // Set the avatar relation to point to the entity id of the new entity
        relationTypeId: SystemIds.COVER_PROPERTY,
      })
    );
  }

  return ops;
};
