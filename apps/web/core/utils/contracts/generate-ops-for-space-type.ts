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

const DAO_SPACE_TYPES: SpaceType[] = [
  'dao',
  'academic-field',
  'company',
  'government-org',
  'industry',
  'interest',
  'nonprofit',
  'region',
  'protocol',
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
  let hasSpaceType = false;

  if (!TEMPLATE_BASED_TYPES.includes(type)) {
    const newEntity = Graph.createEntity({
      id: newEntityId,
      name: spaceName,
      types: [SystemIds.SPACE_TYPE],
    });

    ops.push(...newEntity.ops);
    hasSpaceType = true;
  }

  switch (type) {
    case 'personal': {
      const { ops: createEntityOps } = Graph.createEntity({
        id: newEntityId,
        name: spaceName,
        types: [SystemIds.SPACE_TYPE],
      });
      ops.push(...createEntityOps);
      hasSpaceType = true;

      const { ops: personTypeOps } = Graph.createRelation({
        fromEntity: newEntityId,
        type: SystemIds.TYPES_PROPERTY,
        toEntity: SystemIds.PERSON_TYPE,
      });
      ops.push(...personTypeOps);

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

  if (!hasSpaceType) {
    hasSpaceType = ops.some(op => {
      if (op.type !== 'createRelation') return false;
      if (!('from' in op) || !('to' in op) || !('relationType' in op)) return false;
      return (
        String(op.from) === newEntityId &&
        String(op.to) === SystemIds.SPACE_TYPE &&
        String(op.relationType) === SystemIds.TYPES_PROPERTY
      );
    });
  }

  if (DAO_SPACE_TYPES.includes(type) && !hasSpaceType) {
    const { ops: spaceTypeOps } = Graph.createRelation({
      fromEntity: newEntityId,
      toEntity: SystemIds.SPACE_TYPE,
      type: SystemIds.TYPES_PROPERTY,
    });

    ops.push(...spaceTypeOps);
  }

  if (spaceAvatarUri) {
    const { id: imageId, ops: imageOps } = await Graph.createImage({ url: spaceAvatarUri, network: 'TESTNET' });
    ops.push(...imageOps);

    const { ops: imageRelationOps } = Graph.createRelation({
      fromEntity: newEntityId,
      toEntity: imageId,
      type: ContentIds.AVATAR_PROPERTY,
    });

    ops.push(...imageRelationOps);
  }

  if (spaceCoverUri) {
    const { id: imageId, ops: imageOps } = await Graph.createImage({ url: spaceCoverUri, network: 'TESTNET' });
    ops.push(...imageOps);

    const { ops: imageRelationOps } = Graph.createRelation({
      fromEntity: newEntityId,
      toEntity: imageId,
      type: SystemIds.COVER_PROPERTY,
    });
    ops.push(...imageRelationOps);
  }

  return { ops, spaceEntityId: newEntityId };
};
