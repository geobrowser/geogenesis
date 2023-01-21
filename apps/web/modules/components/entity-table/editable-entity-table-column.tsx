import styled from '@emotion/styled';
import { memo } from 'react';
import { Entity, useEntityStore } from '~/modules/entity';
import { Column } from '~/modules/types';
import { useEditEvents } from '../entity/edit-events';
import { StringField } from '../entity/editable-fields';

const Entities = styled.div(({ theme }) => ({
  display: 'flex',
  flexWrap: 'wrap',
  gap: theme.space * 3,
}));

interface Props {
  column: Column;
  space: string;
  entityId: string;
  hasActions: boolean;
}

export const EditableEntityTableColumn = memo(function EditableEntityTableColumn({
  column,
  space,
  entityId,
  hasActions,
}: Props) {
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

  // We hydrate the local editable store with the triples from the server. While it's hydrating
  // we can fallback to the server triples so we render real data and there's no layout shift.
  const triples = localTriples.length === 0 && !hasActions ? column.triples : localTriples;
  const name = Entity.name(triples) ?? '';
  const nameTriple = Entity.nameTriple(triples);

  return (
    <Entities>
      <StringField
        variant="body"
        placeholder="Column name..."
        onChange={e => send({ type: 'EDIT_ENTITY_NAME', payload: { triple: nameTriple, name: e.target.value } })}
        value={name}
      />
    </Entities>
  );
});
