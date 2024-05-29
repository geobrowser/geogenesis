import { SYSTEM_IDS, createImageEntityOps } from '@geogenesis/sdk';

import { Triple } from '~/core/types';

import { Value } from '../value';

type CreateImageTriplesArgs = {
  imageSource: string;
  spaceId: string;
};

type CreateImageTriplesReturnType = [
  {
    space: string;
    entityId: string;
    entityName: null;
    attributeId: typeof SYSTEM_IDS.TYPES;
    attributeName: 'Types';
    value: {
      type: 'ENTITY';
      value: typeof SYSTEM_IDS.IMAGE;
      name: null;
    };
  },
  {
    space: string;
    entityId: string;
    entityName: null;
    attributeId: typeof SYSTEM_IDS.IMAGE_COMPOUND_TYPE_IMAGE_URL_ATTRIBUTE;
    attributeName: 'Image URL';
    value: {
      type: 'URL';
      value: string;
    };
  },
];

export function createImageEntityTriples({
  imageSource,
  spaceId,
}: CreateImageTriplesArgs): CreateImageTriplesReturnType {
  const [typeOp, urlOp] = createImageEntityOps(Value.toImageValue(imageSource));

  // Entity with type Image
  return [
    {
      space: spaceId,
      entityId: typeOp.payload.entityId,
      entityName: null,
      attributeId: typeOp.payload.attributeId,
      attributeName: 'Types',
      value: {
        type: 'ENTITY',
        value: typeOp.payload.value.value,
        name: null,
      },
    },
    {
      space: spaceId,
      entityId: urlOp.payload.entityId,
      entityName: null,
      attributeId: urlOp.payload.attributeId,
      attributeName: 'Image URL',
      value: {
        type: 'URL',
        value: typeOp.payload.value.value,
      },
    },
  ];
}
