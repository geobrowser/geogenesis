import { CreateRelationOp, DeleteRelationOp, Id } from '@graphprotocol/grc-20';

import { Relation, Value } from '~/core/v2.types';

export function timestamp() {
  return new Date().toISOString();
}

export function prepareLocalDataForPublishing(values: Value[], relations: Relation[], spaceId: string) {
  const validValues = values.filter(
    // Deleted ops have a value of ''. Make sure we don't filter those out
    v => v.spaceId === spaceId && !v.hasBeenPublished && v.property.id !== '' && v.entity.id !== ''
  );

  const relationOps = relations.map((r): CreateRelationOp | DeleteRelationOp => {
    if (r.isDeleted) {
      return {
        type: 'DELETE_RELATION',
        id: Id.Id(r.id),
      };
    }

    return {
      type: 'CREATE_RELATION',
      relation: {
        id: Id.Id(r.id),
        type: Id.Id(r.type.id),
        entity: Id.Id(r.entityId),
        fromEntity: Id.Id(r.fromEntity.id),
        toEntity: Id.Id(r.toEntity.id),
        position: r.position ?? undefined,
        verified: r.verified ?? undefined,
        toSpace: r.toSpaceId ? Id.Id(r.toSpaceId) : undefined,
      },
    };
  });

  // @TODO(migration): Need to group values and squash into Entity ops
  // const tripleOps = validValues.map((t): SetTripleOp | DeleteTripleOp => {
  //   if (t.isDeleted) {
  //     return {
  //       type: 'DELETE_TRIPLE',
  //       triple: {
  //         entity: t.entityId,
  //         attribute: t.attributeId,
  //       },
  //     };
  //   }

  //   return {
  //     type: 'SET_TRIPLE',
  //     triple: {
  //       entity: t.entityId,
  //       attribute: t.attributeId,
  //       value: {
  //         type: t.value.type,
  //         value: t.value.value,
  //         ...(t.value.options !== undefined && {
  //           options: Object.fromEntries(Object.entries(t.value.options).filter(([, v]) => v !== undefined)),
  //         }),
  //       },
  //     },
  //   };
  // });

  return {
    opsToPublish: [...relationOps],
  };
}
