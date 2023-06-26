import { SYSTEM_IDS } from '@geogenesis/ids';
import { Entity } from '~/modules/entity';
import { LinkableChip } from '../../design-system/chip';
import { Cell, Triple } from '../../types';
import { NavUtils } from '../../utils';
import { ImageZoom } from '../editable-fields/editable-fields';
import { CellContent } from '../table/cell-content';
import { DateField } from '../editable-fields/date-field';

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
    const value = Entity.name(cell.triples) ?? entityId;

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

        if (value.type === 'date') {
          return <DateField variant="tableCell" isEditing={false} key={value.id} value={value.value} />;
        }

        return <CellContent key={value.id} isExpanded={isExpanded} value={value.value} />;
      })}
    </div>
  );
};
