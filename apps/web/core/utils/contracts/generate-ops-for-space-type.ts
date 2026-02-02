import { Account, ContentIds, Graph, Op, SystemIds } from '@geoprotocol/geo-sdk';

import { ID } from '~/core/id';
import { EntityId } from '~/core/io/substream-schema';
import type { SpaceType } from '~/core/types';
import { cloneEntity } from '~/core/utils/contracts/clone-entity';
import { validateEntityId } from '~/core/utils/utils';

type DeployArgs = {
  type: SpaceType;
  spaceName: string;
  spaceAvatarUri: string | null;
  spaceCoverUri: string | null;
  initialEditorAddress: string;
  entityId?: string;
};

// Space types that use templates - don't create entity first, let cloneEntity handle it
const TEMPLATE_BASED_TYPES: SpaceType[] = [
  'personal',
  'company',
  'academic-field',
  'dao',
  'industry',
  'interest',
  'protocol',
  'region',
];

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

  if (!TEMPLATE_BASED_TYPES.includes(type)) {
    // For non-template types (default, nonprofit, government-org), create the entity with SPACE_TYPE
    const newEntity = Graph.createEntity({
      id: newEntityId,
      name: spaceName,
      types: [SystemIds.SPACE_TYPE],
    });

    ops.push(...newEntity.ops);
  }

  // Add space type-specific ops
  switch (type) {
    case 'personal': {
      // Create entity with SPACE_TYPE (required for space page entity)
      const { ops: createEntityOps } = Graph.createEntity({
        id: newEntityId,
        name: spaceName,
        types: [SystemIds.SPACE_TYPE],
      });
      ops.push(...createEntityOps);

      // Add PERSON_TYPE relation
      const { ops: personTypeOps } = Graph.createRelation({
        fromEntity: newEntityId,
        type: SystemIds.TYPES_PROPERTY,
        toEntity: SystemIds.PERSON_TYPE,
      });
      ops.push(...personTypeOps);

      // Create Account entity and relation
      const { accountId, ops: accountOps } = Account.make(initialEditorAddress);
      ops.push(...accountOps);

      const { ops: accountRelationOps } = Graph.createRelation({
        fromEntity: newEntityId,
        toEntity: accountId,
        type: SystemIds.ACCOUNTS_PROPERTY,
      });
      ops.push(...accountRelationOps);

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
    case 'government-org': {
      // @TODO government org template
      const { ops: imageRelationOps } = Graph.createRelation({
        fromEntity: newEntityId,
        toEntity: SystemIds.GOVERNMENT_ORG_TYPE,
        type: SystemIds.TYPES_PROPERTY,
      });

      ops.push(...imageRelationOps);
      break;
    }
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
    // Use TESTNET network to upload to Pinata via alternative gateway
    const { id: imageId, ops: imageOps } = await Graph.createImage({ url: spaceAvatarUri, network: 'TESTNET' });

    // Creates the image entity
    ops.push(...imageOps);

    // Creates the relation pointing to the image entity
    const { ops: imageRelationOps } = Graph.createRelation({
      fromEntity: newEntityId,
      toEntity: imageId,
      type: ContentIds.AVATAR_PROPERTY,
    });

    ops.push(...imageRelationOps);
  }

  if (spaceCoverUri) {
    // Use TESTNET network to upload to Pinata via alternative gateway
    const { id: imageId, ops: imageOps } = await Graph.createImage({ url: spaceCoverUri, network: 'TESTNET' });

    // Creates the image entity
    ops.push(...imageOps);

    // Creates the relation pointing to the image entity
    const { ops: imageRelationOps } = Graph.createRelation({
      fromEntity: newEntityId,
      toEntity: imageId,
      type: SystemIds.COVER_PROPERTY,
    });
    ops.push(...imageRelationOps);
  }

  return { ops, spaceEntityId: newEntityId };
};
