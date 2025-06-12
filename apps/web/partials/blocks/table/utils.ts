import { SystemIds } from '@graphprotocol/grc-20';

import { Cell } from '~/core/types';
import { DataType, RenderableProperty } from '~/core/v2.types';

interface MakePlaceholderFromValueTypeArgs {
  dataType: DataType;
  propertyId: string;
  propertyName: string | null;
  spaceId: string;
  entityId: string;
}

export function makePlaceholderFromValueType(args: MakePlaceholderFromValueTypeArgs): RenderableProperty {
  const { propertyId, propertyName, entityId, dataType, spaceId } = args;

  switch (dataType) {
    case 'RELATION':
      return {
        type: 'RELATION',
        propertyId,
        propertyName,
        fromEntityId: entityId,
        fromEntityName: null,
        spaceId,
        valueName: null,
        value: '',
        relationId: '',
        placeholder: true,
      };
    case 'TIME':
      return {
        type: 'TIME',
        propertyId,
        propertyName,
        entityId,
        entityName: null,
        spaceId,
        value: '',
        placeholder: true,
      };
    // @TODO(migration): Fix renderable URL
    // case SystemIds.URL:
    //   return {
    //     type: 'URL',
    //     propertyId,
    //     propertyName,
    //     entityId,
    //     entityName: null,
    //     spaceId,
    //     value: '',
    //     placeholder: true,
    //   };

    case 'TEXT':
    default:
      return {
        type: 'TEXT',
        propertyId,
        propertyName,
        entityId,
        entityName: null,
        spaceId,
        value: '',
        placeholder: true,
      };
  }
}

export const getName = (nameCell: Cell, currentSpaceId: string) => {
  let name = nameCell?.name;
  const maybeNameInSpaceRenderable = nameCell.renderables.find(
    r => r.attributeId === SystemIds.NAME_ATTRIBUTE && r.spaceId === currentSpaceId
  );

  let maybeNameInSpace = maybeNameInSpaceRenderable?.value;

  if (maybeNameInSpaceRenderable?.type === 'RELATION') {
    maybeNameInSpace = maybeNameInSpaceRenderable?.valueName ?? maybeNameInSpace;
  }

  const maybeNameRenderable = nameCell?.renderables.find(r => r.attributeId === SystemIds.NAME_ATTRIBUTE);

  let maybeOtherName = maybeNameRenderable?.value;

  if (maybeNameRenderable?.type === 'RELATION') {
    maybeOtherName = maybeNameRenderable?.valueName ?? maybeNameInSpace;
  }

  const maybeName = maybeNameInSpace ?? maybeOtherName;

  if (maybeName) {
    name = maybeName ?? null;
  }

  return name;
};
