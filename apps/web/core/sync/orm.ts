// orm handles querying entities based on their base data,
// triples, or relations contents.
import { SystemIds } from '@graphprotocol/grc-20';
import { QueryClient } from '@tanstack/react-query';

import { Triple } from '../database/Triple';
import { readTypes } from '../database/entities';
import { Entity } from '../io/dto/entities';
import { EntityId } from '../io/schema';
import { fetchEntity } from '../io/subgraph';
import { Relation } from '../types';
import { Entities } from '../utils/entity';
import { Triples } from '../utils/triples';
import { GeoStore } from './store';

// orm should be in change of storing queries and consumers
// and return any updated data to subscribes/query-ers

function mergeRelations(localRelations: Relation[], remoteRelations: Relation[]) {
  const locallyDeletedRelations = localRelations.filter(r => r.isDeleted).map(r => r.id);

  const deletedRelationIds = new Set(locallyDeletedRelations);
  const remoteRelationsThatWerentDeleted = remoteRelations
    // Only return initialRelations that haven't been deleted locally
    .filter(r => !deletedRelationIds.has(r.id));

  // @TODO: Merge local triples for updated (not created) relations. This is for things like
  // the index.
  return [...localRelations, ...remoteRelationsThatWerentDeleted];
}

/**
 * The Entity data model is in charge of querying and merging
 * data related to entities.
 *
 * @TODO Where do we make the network call? We can't assume
 * that we always have the fully resolved entity locally to
 * already include network data.
 *
 * @TODO When do we merge queried data vs written data?
 */
export class E {
  static merge({ id, store, mergeWith }: { id: string; store: GeoStore; mergeWith?: Entity | null }) {
    const remoteEntity = mergeWith;
    const localEntity = store.getEntity(id);

    console.log('merged relations', { remoteEntity, localEntity });

    if (!localEntity && !remoteEntity) {
      return null;
    }

    if (!remoteEntity) {
      return localEntity ?? null;
    }

    if (!localEntity) {
      return null;
    }

    const mergedTriples = Triples.merge(
      localEntity.triples.map(t =>
        Triple.make(t, {
          hasBeenPublished: t.hasBeenPublished,
          isDeleted: t.isDeleted,
        })
      ),
      remoteEntity.triples
    );

    const mergedRelations = mergeRelations(localEntity.relationsOut, remoteEntity.relationsOut);

    // Use the merged triples to derive the name instead of the remote entity
    // `name` property in case the name was deleted/changed locally.
    const name = Entities.name(mergedTriples);
    const description = Entities.description(mergedTriples);
    const types = readTypes(mergedRelations);

    return {
      id: EntityId(id),
      name,
      nameTripleSpaces: mergedTriples.filter(t => t.attributeId === SystemIds.NAME_ATTRIBUTE).map(t => t.space),
      spaces: [...(localEntity?.spaces ?? []), ...(remoteEntity?.spaces ?? [])],
      description,
      types,
      triples: mergedTriples,
      relationsOut: mergedRelations,
      // @TODO: Spaces with metadata
      // @TODO: Schema? Adding schema here might result in infinite queries since we
      // if we called getEntity from within getEntity it would query infinitlely deep
      // until we hit some defined base-case. We could specify a max depth for the
      // recursion so we only return the closest schema and not the whole chain.
      schema: [],
    };
  }

  static async findOne({ id, store, cache }: { id: string; store: GeoStore; cache: QueryClient }) {
    const cachedEntity = await cache.fetchQuery({
      queryKey: ['entity-for-merging', id],
      queryFn: ({ signal }) => fetchEntity({ id, signal }),
    });

    return this.merge({ id, store, mergeWith: cachedEntity });
  }

  static async findMany(store: GeoStore, condition: any) {}
}
