import { CreateRelationOp, DeleteRelationOp, DeleteTripleOp, Op, SetTripleOp } from '@graphprotocol/grc-20';
import { QueryClient } from '@tanstack/react-query';

import { GeoEventStream } from './stream';

// Store latest ops for a given entity by the space, triple id, or relation id
type RelationChanges = Map<string, CreateRelationOp | DeleteRelationOp>;
type PropertyChanges = Map<string, SetTripleOp | DeleteTripleOp>;
type EntityChange = Map<string, { relationChanges: RelationChanges; propertyChanges: PropertyChanges }>;
type SpaceChanges = Map<string, EntityChange>;

export class ChangeStream {
  stream: GeoEventStream;
  cache: QueryClient;
  changes: SpaceChanges = new Map();
  ops: Op[] = [];

  constructor(stream: GeoEventStream, cache: QueryClient) {
    this.stream = stream;
    this.cache = cache;

    const onTriplesUpdated = this.stream.on(GeoEventStream.TRIPLES_CREATED, event => {
      // Write to changes based on space id -> entity id -> triple id
    });

    const onTriplesDeleted = this.stream.on(GeoEventStream.TRIPLES_DELETED, event => {
      // Write to changes based on space id -> entity id -> triple id
    });

    const onRelationsCreated = this.stream.on(GeoEventStream.RELATION_CREATED, event => {
      // Write to changes based on space id -> entity id -> relation id
    });

    const onRelationsDeleted = this.stream.on(GeoEventStream.RELATION_DELETED, event => {
      // Write to changes based on space id -> entity id -> relation id
    });
  }
}
