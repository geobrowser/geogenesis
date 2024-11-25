import { SYSTEM_IDS } from '@geogenesis/sdk';

import { RenderableProperty } from '~/core/types';
import { NavUtils } from '~/core/utils/utils';

import { LinkableChip } from '~/design-system/chip';
import { DateField } from '~/design-system/editable-fields/date-field';
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
  const isNameCell = columnId === SYSTEM_IDS.NAME;

  if (isNameCell) {
    // the name might exist but be empty, fall back to the entity id in this case.
    const value =
      (renderables.find(r => r.type === 'TEXT' && r.attributeId === SYSTEM_IDS.NAME)?.value as string | undefined) ??
      entityId;
    return <CellContent key={value} href={NavUtils.toEntity(space, entityId)} isExpanded={isExpanded} value={value} />;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {renderables.map(renderable => {
        if (renderable.type === 'RELATION') {
          const value = renderable.value;
          const name = renderable.valueName;
          return (
            <LinkableChip key={value} href={NavUtils.toEntity(space, value)}>
              {name ?? value}
            </LinkableChip>
          );
        }

        if (renderable.type === 'URI') {
          return <WebUrlField variant="tableCell" isEditing={false} key={renderable.value} value={renderable.value} />;
        }

        if (renderable.type === 'TIME') {
          return <DateField variant="tableCell" isEditing={false} key={renderable.value} value={renderable.value} />;
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
