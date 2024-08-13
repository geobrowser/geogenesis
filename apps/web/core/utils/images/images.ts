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
      type: 'URI';
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
      entityId: typeOp.triple.entity,
      entityName: null,
      attributeId: typeOp.triple.attribute,
      attributeName: 'Types',
      value: {
        type: 'ENTITY',
        value: typeOp.triple.value.value,
        name: null,
      },
    },
    {
      space: spaceId,
      entityId: urlOp.triple.entity,
      entityName: null,
      attributeId: urlOp.triple.attribute,
      attributeName: 'Image URL',
      value: {
        type: 'URI',
        value: Values.toImageValue(urlOp.triple.value.value),
      },
    },
  ];
}
