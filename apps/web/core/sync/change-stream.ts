import { QueryClient } from '@tanstack/react-query';

import { GeoEvent, GeoEventStream } from './stream';

// Store latest ops for a given entity by the space, triple id, or relation id

export class ChangeStream {
  stream: GeoEventStream;
  cache: QueryClient;
  // tripleChanges: PropertyChanges = new Map();
  // relationChanges: RelationChanges = new Map();
  // ops: Op[] = [];

  constructor(stream: GeoEventStream, cache: QueryClient) {
    this.stream = stream;
    this.cache = cache;

    // const onTriplesUpdated = this.stream.on(GeoEventStream.VALUES_CREATED, event => {
    //   this.processDiff(event);
    // });

    // const onTriplesDeleted = this.stream.on(GeoEventStream.VALUES_DELETED, event => {
    //   // Write to changes based on space id -> entity id -> triple id
    //   this.processDiff(event);
    // });

    // const onRelationsCreated = this.stream.on(GeoEventStream.RELATION_CREATED, event => {
    //   // Write to changes based on space id -> entity id -> relation id
    // });

    // const onRelationsDeleted = this.stream.on(GeoEventStream.RELATION_DELETED, event => {
    //   // Write to changes based on space id -> entity id -> relation id
    // });
  }

  async processDiff(event: GeoEvent) {
    let entityId: string | null = null;

    switch (event.type) {
      case GeoEventStream.VALUES_CREATED:
      case GeoEventStream.VALUES_DELETED: {
        entityId = event.value.entityId;
        break;
      }
    }

    if (!entityId) {
      return;
    }
  }
}
