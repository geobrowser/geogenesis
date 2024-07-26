import { SYSTEM_IDS, createImageEntityOps } from '@geogenesis/sdk';

import { Values } from '../value';

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
    attributeId: typeof SYSTEM_IDS.IMAGE_URL_ATTRIBUTE;
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
  const [typeOp, urlOp] = createImageEntityOps(Values.toImageValue(imageSource));

  // Entity with type Image
  return [
    {
      space: spaceId,
      entityId: typeOp.triple.entityId,
      entityName: null,
      attributeId: typeOp.triple.attributeId,
      attributeName: 'Types',
      value: {
        type: 'ENTITY',
        value: typeOp.triple.value.value,
        name: null,
      },
    },
    {
      space: spaceId,
      entityId: urlOp.triple.entityId,
      entityName: null,
      attributeId: urlOp.triple.attributeId,
      attributeName: 'Image URL',
      value: {
        type: 'URL',
        value: typeOp.triple.value.value,
      },
    },
  ];
}
