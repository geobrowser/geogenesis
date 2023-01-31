import { memo } from 'react';
import { useActionsStoreContext } from '~/modules/action';
import { Entity } from '~/modules/entity';
import { Triple } from '~/modules/triple';
import { Column, Triple as Tripl } from '~/modules/types';
import { useEditEvents } from '../entity/edit-events';
import { StringField } from '../entity/editable-fields';

interface Props {
  column: Column;
  space: string;
  entityId: string;
}

export const EditableEntityTableColumn = memo(function EditableEntityTableColumn({ column, space, entityId }: Props) {
  const { actions$, create, update, remove } = useActionsStoreContext();
  const localTriples = Triple.fromActions(actions$.get()[space], column.triples).filter(t => t.entityId === column.id);

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
  const triples = localTriples.length === 0 ? column.triples : localTriples;
  const name = Entity.name(triples) ?? '';
  const nameTriple = Entity.nameTriple(triples);

  return (
    <div className="flex flex-wrap gap-3">
      <StringField
        variant="smallTitle"
        placeholder="Column name..."
        onChange={e => send({ type: 'EDIT_ENTITY_NAME', payload: { triple: nameTriple, name: e.target.value } })}
        value={name}
      />
    </div>
  );
});
