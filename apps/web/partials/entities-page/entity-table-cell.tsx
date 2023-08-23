import { SYSTEM_IDS } from '@geogenesis/ids';

import { Cell, Triple } from '~/core/types';
import { Entity } from '~/core/utils/entity';
import { NavUtils } from '~/core/utils/utils';

import { LinkableChip } from '~/design-system/chip';
import { DateField } from '~/design-system/editable-fields/date-field';
import { ImageZoom } from '~/design-system/editable-fields/editable-fields';
import { WebUrlField } from '~/design-system/editable-fields/web-url-field';
import { CellContent } from '~/design-system/table/cell-content';

interface Props {
  cell: Cell;
  triples: Triple[];
  space: string;
  isExpanded: boolean;
}

export const EntityTableCell = ({ cell, triples, space, isExpanded }: Props) => {
  const isNameCell = cell.columnId === SYSTEM_IDS.NAME;

  if (isNameCell) {
    const entityId = cell.entityId;
    const value = Entity.name(triples) ?? entityId;

    return <CellContent key={value} href={NavUtils.toEntity(space, entityId)} isExpanded={isExpanded} value={value} />;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {triples.map(({ value }) => {
        if (value.type === 'entity') {
          return (
            <LinkableChip key={value.id} href={NavUtils.toEntity(space, value.id)}>
              {value.name ?? value.id}
            </LinkableChip>
          );
        }

        if (value.type === 'image') {
          return <ImageZoom key={value.id} imageSrc={value.value} variant="table-cell" />;
        }

        if (value.type === 'url') {
          return <WebUrlField variant="tableCell" isEditing={false} key={value.id} value={value.value} />;
        }

        if (value.type === 'date') {
          return <DateField variant="tableCell" isEditing={false} key={value.id} value={value.value} />;
        }

        return <CellContent key={value.id} isExpanded={isExpanded} value={value.value} />;
      })}
    </div>
  );
};
