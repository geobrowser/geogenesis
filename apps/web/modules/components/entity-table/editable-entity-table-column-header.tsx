import { memo, useState } from 'react';
import { useActionsStore } from '~/modules/action';
import { Entity } from '~/modules/entity';
import { Triple } from '~/modules/triple';
import { Column } from '~/modules/types';
import { useEditEvents } from '../entity/edit-events';

interface Props {
  column: Column;
  // This spaceId is the spaceId of the attribute, not the current space.
  // We need the attribute spaceId to get the actions for the attribute
  // (since actions are grouped by spaceId) to be able to keep the updated
  // name in sync.
  spaceId?: string;
  entityId: string;
}

export const EditableEntityTableColumnHeader = memo(function EditableEntityTableColumn({
  column,
  spaceId,
  entityId,
}: Props) {
  const { actions, create, update, remove } = useActionsStore(spaceId);
  const localTriples = Triple.fromActions(actions, column.triples).filter(t => t.entityId === column.id);

  // There's some issue where this component is losing focus after changing the value of the input. For now we can work
  // around this issue by using local state.
  const [localName, setLocalName] = useState(Entity.name(localTriples) ?? '');

  const send = useEditEvents({
    context: {
      entityId,
      spaceId: spaceId ?? '',
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
  const nameTriple = Entity.nameTriple(triples);

  return (
    <div className="flex flex-wrap gap-3">
      <input
        className="text-smallTitle w-full focus:outline-none placeholder:text-grey-02"
        onChange={e => setLocalName(e.currentTarget.value)}
        placeholder="Column name..."
        onBlur={e => send({ type: 'EDIT_ENTITY_NAME', payload: { triple: nameTriple, name: e.target.value } })}
        value={localName}
      />
    </div>
  );
});
