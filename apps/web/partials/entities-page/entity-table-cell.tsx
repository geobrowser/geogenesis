import { SystemIds } from '@graphprotocol/grc-20';

import { RenderableProperty } from '~/core/types';
import { NavUtils, getImagePath } from '~/core/utils/utils';

import { LinkableRelationChip } from '~/design-system/chip';
import { DateField } from '~/design-system/editable-fields/date-field';
import { ImageZoom } from '~/design-system/editable-fields/editable-fields';
import { WebUrlField } from '~/design-system/editable-fields/web-url-field';
import { CellContent } from '~/design-system/table/cell-content';

interface Props {
  entityId: string;
  columnId: string;
  renderables: RenderableProperty[];
  space: string;
  isExpanded: boolean;
}

export const EntityTableCell = ({ entityId, columnId, renderables, space, isExpanded }: Props) => {
  const isNameCell = columnId === SystemIds.NAME_ATTRIBUTE;

  if (isNameCell) {
    const maybeValueInSpace = renderables.find(
      r => r.type === 'TEXT' && r.attributeId === SystemIds.NAME_ATTRIBUTE && r.spaceId === space
    )?.value;

    // You might have multiple renderables across multiple spaces. In cases where we only render one,
    // default to the one in the current space.
    const value =
      maybeValueInSpace ??
      (renderables.find(r => r.type === 'TEXT' && r.attributeId === SystemIds.NAME_ATTRIBUTE)?.value as
        | string
        | undefined) ??
      // the name might exist but be empty, fall back to the entity id in this case.
      entityId;

    return <CellContent key={value} href={NavUtils.toEntity(space, entityId)} isExpanded={isExpanded} value={value} />;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {renderables.map(renderable => {
        if (renderable.type === 'IMAGE') {
          const value = renderable.value;
          return <ImageZoom key={value} variant="table-cell" imageSrc={getImagePath(value)} />;
        }

        if (renderable.type === 'RELATION') {
          const value = renderable.value;
          const name = renderable.valueName;
          const relationId = renderable.relationId;
          const relationValue = renderable.value;
          const spaceId = renderable.spaceId;

          return (
            <LinkableRelationChip
              key={value}
              isEditing={false}
              entityHref={NavUtils.toEntity(spaceId, relationValue ?? '')}
              relationHref={NavUtils.toEntity(spaceId, relationId)}
            >
              {name ?? value}
            </LinkableRelationChip>
          );
        }

        if (renderable.type === 'URL') {
          return (
            <WebUrlField
              variant="tableCell"
              isEditing={false}
              key={renderable.value}
              spaceId={space}
              value={renderable.value}
            />
          );
        }

        if (renderable.type === 'TIME') {
          return (
            <DateField
              variant="tableCell"
              isEditing={false}
              key={renderable.value}
              value={renderable.value}
              format={renderable.options?.format}
            />
          );
        }

        if (renderable.type === 'CHECKBOX') {
          return (
            <input
              type="checkbox"
              disabled
              key={`checkbox-${renderable.attributeId}-${renderable.value}`}
              checked={renderable.value === '1'}
            />
          );
        }

        return <CellContent key={renderable.value} isExpanded={isExpanded} value={renderable.value} />;
      })}
    </div>
  );
};
