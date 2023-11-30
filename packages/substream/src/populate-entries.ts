import * as db from 'zapatos/db';
import type * as Schema from 'zapatos/schema';

import { DESCRIPTION, NAME, TYPES } from './constants/system-ids';
import {
  mapAccounts,
  mapActions,
  mapEntities,
  mapProposals,
  mapProposedVersions,
  mapSpaces,
  mapTriplesWithActionType,
  mapVersions,
} from './map-entries';
import { TripleAction } from './types';
import { upsertChunked } from './utils/db';
import { pool } from './utils/pool';
import { type FullEntry } from './zod';

export async function populateWithFullEntries({
  fullEntries,
  blockNumber,
  timestamp,
  cursor,
}: {
  fullEntries: FullEntry[];
  blockNumber: number;
  timestamp: number;
  cursor: string;
}) {
  try {
    const accounts = mapAccounts(fullEntries[0]?.author);

    const actions: Schema.actions.Insertable[] = mapActions({
      fullEntries,
      cursor,
      timestamp,
      blockNumber,
    });

    const geoEntities: Schema.geo_entities.Insertable[] = mapEntities({
      fullEntries,
      blockNumber,
      timestamp,
    });

    const proposals: Schema.proposals.Insertable[] = mapProposals({
      fullEntries,
      blockNumber,
      timestamp,
      cursor,
    });

    const proposed_versions: Schema.proposed_versions.Insertable[] = mapProposedVersions({
      fullEntries,
      blockNumber,
      timestamp,
      cursor,
    });

    const spaces: Schema.spaces.Insertable[] = mapSpaces(fullEntries, blockNumber);

    const versions: Schema.versions.Insertable[] = mapVersions({
      fullEntries,
      blockNumber,
      timestamp,
      cursor,
    });

    await Promise.all([
      // @TODO: Can we batch these into a single upsert?
      upsertChunked('accounts', accounts, 'id', {
        updateColumns: db.doNothing,
      }),
      upsertChunked('actions', actions, 'id', {
        updateColumns: db.doNothing,
      }),
      // We update the name and description for an entity when mapping
      // through triples.
      upsertChunked('geo_entities', geoEntities, 'id', {
        updateColumns: ['name', 'description', 'updated_at', 'updated_at_block', 'created_by_id'],
        noNullUpdateColumns: ['name', 'description', 'updated_at', 'updated_at_block', 'created_by_id'],
      }),
      upsertChunked('proposals', proposals, 'id', {
        updateColumns: db.doNothing,
      }),
      upsertChunked('proposed_versions', proposed_versions, 'id', {
        updateColumns: db.doNothing,
      }),
      upsertChunked('spaces', spaces, 'id', {
        updateColumns: db.doNothing,
      }),
      upsertChunked('versions', versions, 'id', {
        updateColumns: db.doNothing,
      }),
    ]);

    // @TODO: How are duplicate triples being handled in Geo? I know it's possible, but if
    // the triple ID is defined, what does that entail
    const triplesDatabaseTuples = mapTriplesWithActionType(fullEntries, timestamp, blockNumber);

    const tripleTransactions: {
      actionType: TripleAction;
      isAddType: boolean;
      isDeleteType: boolean;
      triple: Schema.triples.Insertable;
    }[] = [];

    for (const [actionType, triple] of triplesDatabaseTuples) {
      const isCreateTriple = actionType === TripleAction.Create;
      const isDeleteTriple = actionType === TripleAction.Delete;
      const isAddType = triple.attribute_id === TYPES && isCreateTriple;
      const isDeleteType = triple.attribute_id === TYPES && isDeleteTriple;
      const isNameAttribute = triple.attribute_id === NAME;
      const isDescriptionAttribute = triple.attribute_id === DESCRIPTION;
      const isStringValueType = triple.value_type === 'string';

      const isNameCreateAction = isCreateTriple && isNameAttribute && isStringValueType;
      const isNameDeleteAction = isDeleteTriple && isNameAttribute && isStringValueType;
      const isDescriptionCreateAction = isCreateTriple && isDescriptionAttribute && isStringValueType;
      const isDescriptionDeleteAction = isDeleteTriple && isDescriptionAttribute && isStringValueType;

      tripleTransactions.push({
        actionType,
        isAddType,
        isDeleteType,
        triple,
      });

      if (isCreateTriple) {
        await db.upsert('triples', triple, 'id').run(pool);
      }

      if (isDeleteTriple) {
        await db.deletes('triples', { id: triple.id }).run(pool);
      }

      if (isNameCreateAction) {
        await db
          .upsert(
            'geo_entities',
            {
              id: triple.entity_id,
              name: triple.string_value,
              created_by_id: accounts[0]!.id,
              created_at: timestamp,
              created_at_block: blockNumber,
              updated_at: timestamp,
              updated_at_block: blockNumber,
            },
            'id',
            {
              updateColumns: ['name', 'description', 'updated_at', 'updated_at_block', 'created_by_id'],
              noNullUpdateColumns: ['description'],
            }
          )
          .run(pool);
      }

      if (isNameDeleteAction) {
        await db
          .upsert(
            'geo_entities',
            {
              id: triple.entity_id,
              name: null,
              created_by_id: accounts[0]!.id,
              created_at: timestamp,
              created_at_block: blockNumber,
              updated_at: timestamp,
              updated_at_block: blockNumber,
            },
            'id',
            {
              updateColumns: ['name'],
              noNullUpdateColumns: ['description'],
            }
          )
          .run(pool);
      }

      if (isDescriptionCreateAction) {
        await db
          .upsert(
            'geo_entities',
            {
              id: triple.entity_id,
              description: triple.string_value,
              created_by_id: accounts[0]!.id,
              created_at: timestamp,
              created_at_block: blockNumber,
              updated_at: timestamp,
              updated_at_block: blockNumber,
            },
            'id',
            {
              updateColumns: ['description'],
              noNullUpdateColumns: ['name'],
            }
          )
          .run(pool);
      }

      if (isDescriptionDeleteAction) {
        await db
          .upsert(
            'geo_entities',
            {
              id: triple.entity_id,
              description: null,
              created_by_id: accounts[0]!.id,
              created_at: timestamp,
              created_at_block: blockNumber,
              updated_at: timestamp,
              updated_at_block: blockNumber,
            },
            'id',
            {
              updateColumns: ['description'],
              noNullUpdateColumns: ['name'],
            }
          )
          .run(pool);
      }

      if (isAddType) {
        await db
          .upsert(
            'geo_entity_types',
            {
              entity_id: triple.entity_id,
              type_id: triple.value_id,
              created_at: timestamp,
              created_at_block: blockNumber,
            },
            ['entity_id', 'type_id'],
            { updateColumns: db.doNothing }
          )
          .run(pool);
      }

      if (isDeleteType) {
        console.log('Deleting type', triple.value_id, 'to entity', triple.entity_id);
        await db
          .deletes('geo_entity_types', {
            entity_id: triple.entity_id,
            type_id: triple.value_id,
          })
          .run(pool);
      }
    }

    console.log('------ UPSERTING ENTRIES ------');
    console.log('Accounts: ', accounts.length);
    console.log('Actions: ', actions.length);
    console.log('Entities: ', geoEntities.length);
    console.log('Proposals: ', proposals.length);
    console.log('Proposed Versions: ', proposed_versions.length);
    console.log('Spaces: ', spaces.length);
    console.log('Triples: ', triplesDatabaseTuples.length);
    console.log('Versions: ', versions.length);
  } catch (error) {
    console.error(`Error populating entries: ${error}`);
  }
}
