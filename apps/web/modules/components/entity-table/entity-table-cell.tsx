import styled from '@emotion/styled';
import { Chip } from '../../design-system/chip';
import { Cell } from '../../types';
import { NavUtils } from '../../utils';
import { CellContent } from '../table/cell-content';
import { ChipCellContainer } from '../table/styles';

const Entities = styled.div(({ theme }) => ({
  display: 'flex',
  flexWrap: 'wrap',
  gap: theme.space * 3,
}));

interface Props {
  cell: Cell;
  space: string;
  isExpanded: boolean;
}

export const EntityTableCell = ({ cell, space, isExpanded }: Props) => {
  return (
    <Entities>
      {cell.triples.map(({ value, entityId, entityName }) => {
        if (cell.columnId === 'name') {
          const value = entityName ?? entityId;
          return (
            <CellContent
              key={value}
              isEntity
              href={NavUtils.toEntity(space, entityId)}
              isExpanded={isExpanded}
              value={value}
            />
          );
        } else if (value.type === 'entity') {
          return (
            <ChipCellContainer key={value.id}>
              <Chip href={NavUtils.toEntity(space, value.id)}>{value.name ?? value.id}</Chip>
            </ChipCellContainer>
          );
        } else {
          return <CellContent key={value.id} isExpanded={isExpanded} value={value.value} />;
        }
      })}
    </Entities>
  );
};
