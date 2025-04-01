import { CreateRelationOp, DeleteRelationOp, DeleteTripleOp, Op, SetTripleOp } from '@graphprotocol/grc-20';
import { QueryClient } from '@tanstack/react-query';

import { ID } from '../id';
import { fetchEntity } from '../io/subgraph';
import { isRealChange } from '../utils/change/change';
import { AfterTripleDiff, BeforeTripleDiff } from '../utils/change/get-triple-change';
import { GeoEvent, GeoEventStream } from './stream';

// Store latest ops for a given entity by the space, triple id, or relation id
type RelationChanges = Map<string, (CreateRelationOp & { spaceId: string }) | (DeleteRelationOp & { spaceId: string })>;
type PropertyChanges = Map<string, (SetTripleOp & { spaceId: string }) | (DeleteTripleOp & { spaceId: string })>;

export class ChangeStream {
  stream: GeoEventStream;
  cache: QueryClient;
  tripleChanges: PropertyChanges = new Map();
  relationChanges: RelationChanges = new Map();
  ops: Op[] = [];

  constructor(stream: GeoEventStream, cache: QueryClient) {
    this.stream = stream;
    this.cache = cache;

    const onTriplesUpdated = this.stream.on(GeoEventStream.TRIPLES_CREATED, event => {
      this.processDiff(event);
    });

    const onTriplesDeleted = this.stream.on(GeoEventStream.TRIPLES_DELETED, event => {
      // Write to changes based on space id -> entity id -> triple id
      this.processDiff(event);
    });

    const onRelationsCreated = this.stream.on(GeoEventStream.RELATION_CREATED, event => {
      // Write to changes based on space id -> entity id -> relation id
    });

    const onRelationsDeleted = this.stream.on(GeoEventStream.RELATION_DELETED, event => {
      // Write to changes based on space id -> entity id -> relation id
    });
  }

  async processDiff(event: GeoEvent) {
    let entityId: string | null = null;

    switch (event.type) {
      case 'triples:updated':
      case 'triples:deleted': {
        entityId = event.triple.entityId;
        break;
      }
    }

    if (!entityId) {
      return;
    }

    // @TODO: Need to do this in a worker
    const entity = await this.cache.fetchQuery({
      queryKey: ['change-stream', 'entity', entityId],
      queryFn: () => fetchEntity({ id: entityId }),
    });

    switch (event.type) {
      case 'triples:updated': {
        const newId = ID.createTripleId(event.triple);
        const maybeRemoteTriple = entity?.triples.find(t => ID.createTripleId(t) === newId);

        const after = AfterTripleDiff.diffAfter(event.triple.value, maybeRemoteTriple?.value ?? null);
        const before = AfterTripleDiff.diffBefore(event.triple.value, maybeRemoteTriple?.value ?? null);

        /**
         * Keep track of any local changes that are different than data
         * that exists remotely for the same property.
         */
        if (isRealChange(before, after)) {
          this.tripleChanges.set(newId, {
            type: 'SET_TRIPLE',
            spaceId: event.triple.space,
            triple: {
              attribute: event.triple.attributeId,
              entity: event.triple.entityId,
              value: {
                ...event.triple.value,
              },
            },
          });
        } else {
          this.tripleChanges.delete(newId);
        }

        break;
      }
      case 'triples:deleted': {
        const newId = ID.createTripleId(event.triple);
        const maybeRemoteTriple = entity?.triples.find(t => ID.createTripleId(t) === newId);

        /**
         * Keep track of any local changes that are different than data
         * that exists remotely for the same property.
         */
        if (maybeRemoteTriple) {
          this.tripleChanges.set(newId, {
            type: 'DELETE_TRIPLE',
            spaceId: event.triple.space,
            triple: {
              attribute: event.triple.attributeId,
              entity: event.triple.entityId,
            },
          });
        } else {
          console.log('not real');
          this.tripleChanges.delete(newId);
        }

        break;
      }
    }
  }
}
