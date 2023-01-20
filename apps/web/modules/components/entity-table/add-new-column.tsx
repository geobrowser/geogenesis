import styled from '@emotion/styled';
import { memo } from 'react';
import { Plus } from '~/modules/design-system/icons/plus';
import { Entity, useEntityStore } from '~/modules/entity';
import { Column } from '~/modules/types';
import { useEditEvents } from '../entity/edit-events';

const StyledIconButton = styled.button(props => ({
  all: 'unset',
  backgroundColor: props.theme.colors['grey-01'],
  color: props.theme.colors['grey-04'],
  padding: `${props.theme.space * 2.5}px ${props.theme.space * 3}px`,
  transition: 'colors 0.15s ease-in-out',
  position: 'absolute',
  right: 0,
  top: 0,
  bottom: 2,
  zIndex: 1,
  borderTopRightRadius: props.theme.radius,

  '&:hover': {
    cursor: 'pointer',
    backgroundColor: props.theme.colors['grey-01'],
    color: props.theme.colors.text,
  },

  '&:active': {
    color: props.theme.colors.text,
    outlineColor: props.theme.colors.ctaPrimary,
  },

  '&:focus': {
    color: props.theme.colors.text,
    outlineColor: props.theme.colors.ctaPrimary,
  },
}));

interface Props {
  column: Column;
  space: string;
  entityId: string;
  hasActions: boolean;
}

export const AddNewColumn = memo(function AddNewColumn({ column, space, entityId }: Props) {
  const { triples: localTriples, update, create, remove } = useEntityStore();

  const send = useEditEvents({
    context: {
      entityId,
      spaceId: space,
      entityName: Entity.name(localTriples) ?? '',
    },
    api: {
      create,
      update,
      remove,
    },
  });

  return (
    <StyledIconButton onClick={() => send()}>
      <Plus />
    </StyledIconButton>
  );
});
