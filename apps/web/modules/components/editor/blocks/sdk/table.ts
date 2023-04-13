import { SYSTEM_IDS } from '@geogenesis/ids';

import { Entity } from '~/modules/entity';
import { ID } from '~/modules/id';
import { Entity as IEntity, Triple as ITriple } from '~/modules/types';

export function setName({
  blockEntity,
  name,
  api,
}: {
  blockEntity: IEntity | null;
  name: string;
  api: {
    create: (triple: ITriple) => void;
    update: (triple: ITriple, oldTriple: ITriple) => void;
  };
}) {
  const nameTriple = Entity.nameTriple(blockEntity?.triples ?? []);

  if (!blockEntity) return;
  if (!nameTriple)
    return api.create(
      ID.createTripleWithId({
        attributeId: SYSTEM_IDS.NAME,
        entityId: blockEntity.id,
        entityName: name,
        attributeName: 'Name',
        space: blockEntity.nameTripleSpace ?? '',
        value: { type: 'string', id: ID.createValueId(), value: name },
      })
    );

  api.update({ ...nameTriple, value: { ...nameTriple.value, type: 'string', value: name } }, nameTriple);
}
