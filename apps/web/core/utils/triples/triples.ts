import {
  CreateRelationOp,
  DeleteRelationOp,
  DeleteTripleOp,
  GraphUri,
  GraphUrl,
  SetTripleOp,
  SystemIds,
} from '@graphprotocol/grc-20';

import { Triple as T } from '~/core/database/Triple';
import { StoredRelation, StoredTriple } from '~/core/database/types';
import { ID } from '~/core/id';
import { createValueId } from '~/core/id/create-id';
import { EntityId } from '~/core/io/schema';
import { Relation, Triple } from '~/core/types';

export function timestamp() {
  return new Date().toISOString();
}

export function merge(local: StoredTriple[], remote: Triple[]): StoredTriple[] {
  const localTripleIds = new Set(local.map(t => t.id));
  const remoteTriplesWithoutLocalTriples = remote.filter(
    t => !localTripleIds.has(createValueId({ ...t, space: t.space }))
  );

  const remoteTriplesMappedToLocalTriples = remoteTriplesWithoutLocalTriples.map(t => T.make(t));
  return [...remoteTriplesMappedToLocalTriples, ...local];
}

export function prepareTriplesForPublishing(triples: Triple[], relations: StoredRelation[], spaceId: string) {
  const validTriples = triples.filter(
    // Deleted ops have a value of ''. Make sure we don't filter those out
    t => t.space === spaceId && !t.hasBeenPublished && t.attributeId !== '' && t.entityId !== ''
  );

  const validRelations = relations.filter(r => {
    if (r.isDeleted) {
      return r.space === spaceId && !r.hasBeenPublished;
    }

    return (
      r.space === spaceId &&
      !r.hasBeenPublished &&
      r.typeOf.id !== '' &&
      r.fromEntity.id !== '' &&
      r.toEntity.id !== '' &&
      r.index !== ''
    );
  });

  // We store triples for relations locally so that we can render relations as normal
  // entities on an entity page. This also enables us to add arbitrary triples to a
  // relation entity at any point. It helps to have a unified model for reading and writing
  // data for any entity.
  //
  // Here we filter out those relation local triples and only publish the ones that aren't
  // specifically for the required attributes on a relation.
  //
  // Alternative approach is to not store the ops for a relation locally and just materialize
  // them when we render entity pages for relations.
  const triplesForRelations = getTriplesForRelations(validTriples, relations);
  const triplesToPublish = validTriples.filter(
    t => !triplesForRelations.some(relationTriple => relationTriple.id === t.id)
  );

  const relationOps = validRelations.map((r): CreateRelationOp | DeleteRelationOp => {
    if (r.isDeleted) {
      return {
        type: 'DELETE_RELATION',
        relation: {
          id: r.id,
        },
      };
    }

    return {
      type: 'CREATE_RELATION',
      relation: {
        id: r.id,
        type: r.typeOf.id,
        fromEntity: r.fromEntity.id,
        toEntity: r.toEntity.id,
        index: r.index,
      },
    };
  });

  // @TODO Need to add the relation triples
  const tripleOps = triplesToPublish.map((t): SetTripleOp | DeleteTripleOp => {
    if (t.isDeleted) {
      return {
        type: 'DELETE_TRIPLE',
        triple: {
          entity: t.entityId,
          attribute: t.attributeId,
        },
      };
    }

    return {
      type: 'SET_TRIPLE',
      triple: {
        entity: t.entityId,
        attribute: t.attributeId,
        value: {
          type: t.value.type,
          value: t.value.value,
          ...(t.value.options !== undefined && {
            options: Object.fromEntries(Object.entries(t.value.options).filter(([, v]) => v !== undefined)),
          }),
        },
      },
    };
  });

  return {
    opsToPublish: [...relationOps, ...tripleOps],

    // We return the relation triples so we can keep them locally when rendering
    // entity pages for relations.
    relationTriples: triplesForRelations,
  };
}

const RELATION_ATTRIBUTES = [
  EntityId(SystemIds.TYPES_ATTRIBUTE),
  EntityId(SystemIds.RELATION_FROM_ATTRIBUTE),
  EntityId(SystemIds.RELATION_TO_ATTRIBUTE),
  EntityId(SystemIds.RELATION_TYPE_ATTRIBUTE),
  EntityId(SystemIds.RELATION_INDEX),
];

function getTriplesForRelations(triples: Triple[], relations: Relation[]): Triple[] {
  const relationIds = relations.map(r => r.id);

  return triples
    .filter(t => {
      const isForRelationEntity = relationIds.includes(EntityId(t.entityId));

      if (isForRelationEntity && RELATION_ATTRIBUTES.includes(EntityId(t.attributeId))) {
        // For triples defining the RELATION_TO_PROPERTY we don't want to filter it out
        // if it contains an optional space id.
        if (t.attributeId === SystemIds.RELATION_TO_PROPERTY) {
          const maybeSpaceId = GraphUrl.toSpaceId(t.value.value as GraphUri);

          if (maybeSpaceId) {
            return false;
          }
        }

        return true;
      }

      return false;
    })
    .map(t => {
      return {
        ...t,
        id: ID.createValueId(t),
      };
    });
}
