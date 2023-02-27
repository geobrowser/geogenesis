import * as React from 'react';

import { Entity } from '~/modules/entity';
import { LinkableChip } from '../../design-system/chip';
import { Cell } from '../../types';
import { NavUtils } from '../../utils';
import { CellContent } from '../table/cell-content';

interface Props {
  cell: Cell;
  space: string;
  isExpanded: boolean;
}

export const EntityTableCell = ({ cell, space, isExpanded }: Props) => {
  const isNameCell = cell.columnId === 'name';

  if (isNameCell) {
    const entityId = cell.triples[0].entityId;
    const value = Entity.name(cell.triples) ?? entityId;

    return (
      <CellContent
        key={value}
        isEntity
        href={NavUtils.toEntity(space, entityId)}
        isExpanded={isExpanded}
        value={value}
      />
    );
  } else
    return (
      <div className="flex flex-wrap gap-2">
        {cell.triples.map(({ value }) => {
          if (value.type === 'entity') {
            return (
              <LinkableChip key={value.id} href={NavUtils.toEntity(space, value.id)}>
                {value.name ?? value.id}
              </LinkableChip>
            );
          } else {
            return <CellContent key={value.id} isExpanded={isExpanded} value={value.value} />;
          }
        })}
      </div>
    );
};
