import { SystemIds } from '@graphprotocol/grc-20';

import { Cell, RenderableProperty, ValueTypeId } from '~/core/types';

interface MakePlaceholderFromValueTypeArgs {
  valueType: ValueTypeId;
  attributeId: string;
  attributeName: string | null;
  spaceId: string;
  entityId: string;
}

export function makePlaceholderFromValueType(args: MakePlaceholderFromValueTypeArgs): RenderableProperty {
  const { attributeId, attributeName, entityId, valueType, spaceId } = args;

  switch (valueType) {
    case SystemIds.RELATION:
      return {
        type: 'RELATION',
        attributeId,
        attributeName,
        entityId,
        entityName: null,
        spaceId,
        valueName: null,
        value: '',
        relationId: '',
        placeholder: true,
      };
    case SystemIds.TIME:
      return {
        type: 'TIME',
        attributeId,
        attributeName,
        entityId,
        entityName: null,
        spaceId,
        value: '',
        placeholder: true,
      };
    case SystemIds.URL:
      return {
        type: 'URL',
        attributeId,
        attributeName,
        entityId,
        entityName: null,
        spaceId,
        value: '',
        placeholder: true,
      };

    case SystemIds.TEXT:
    default:
      return {
        type: 'TEXT',
        attributeId,
        attributeName,
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
