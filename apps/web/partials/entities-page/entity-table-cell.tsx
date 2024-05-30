import { SYSTEM_IDS } from '@geogenesis/sdk';

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
    const value = Entity.name(triples) || entityId; // the name might exist but be empty, fall back to the entity id in this case.

    return <CellContent key={value} href={NavUtils.toEntity(space, entityId)} isExpanded={isExpanded} value={value} />;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {triples.map(({ value }) => {
        if (value.type === 'COLLECTION') {
          return null;
        }

        if (value.type === 'ENTITY') {
          return (
            <LinkableChip key={value.value} href={NavUtils.toEntity(space, value.value)}>
              {value.name ?? value.value}
            </LinkableChip>
          );
        }

        if (value.type === 'IMAGE') {
          return <ImageZoom key={value.value} imageSrc={value.image} variant="table-cell" />;
        }

        if (value.type === 'URL') {
          return <WebUrlField variant="tableCell" isEditing={false} key={value.value} value={value.value} />;
        }

        if (value.type === 'TIME') {
          return <DateField variant="tableCell" isEditing={false} key={value.value} value={value.value} />;
        }

        return <CellContent key={value.value} isExpanded={isExpanded} value={value.value} />;
      })}
    </div>
  );
};
