import * as db from 'zapatos/db'
import type * as Schema from 'zapatos/schema'
import { TYPES } from './constants/system-ids'
import { upsertCachedEntries } from './populate-cache'
import { type StreamData, TripleAction } from './types'
import { actionTypeCheck, actionsFromURI, isValidAction } from './utils/actions'
import { upsertChunked } from './utils/db'

import { pool } from './utils/pool'
import { ZodUriData, type FullEntry } from './zod'
import {
  mapAccounts,
  mapActions,
  mapEntities,
  mapProposals,
  mapProposedVersions,
  mapSpaces,
  mapTriplesWithActionType,
  mapVersions,
} from './map-entries'

export async function populateWithEntries({
  entries,
  blockNumber,
  timestamp,
  cursor,
}: StreamData) {
  try {
    const fullEntries: FullEntry[] = []
    const uriResponses = await Promise.all(
      entries.map((entry) => actionsFromURI(entry.uri))
    )

    for (let i = 0; i < entries.length; i++) {
      console.log('\nProcessing entry', i + 1, 'of', entries.length, 'entries')

      // First check if the general response conforms to what we expect
      const uriResponse = ZodUriData.safeParse(uriResponses[i])

      const entry = entries[i]

      if (entry) {
        if (uriResponse.success) {
          // Then check if the actions conform to what we expect
          console.log(
            'Original Action Count: ',
            uriResponse.data.actions.length
          )

          const actions = uriResponse.data.actions.filter(isValidAction)

          console.log('Valid Actions:', actions.length)
          fullEntries.push({
            ...entry,
            uriData: { ...uriResponse.data, actions },
          })
        } else {
          console.error('Failed to parse URI data: ', uriResponse)
          console.error('URI used: ', entry.uri)
          console.error(uriResponse.error)
        }
      }
    }

    await populateWithFullEntries({
      fullEntries,
      blockNumber,
      timestamp,
      cursor,
    })
  } catch (error) {
    console.error(`Error populating entries: ${error} at block ${blockNumber}`)
  }
}

export async function populateWithFullEntries({
  fullEntries,
  blockNumber,
  timestamp,
  cursor,
}: {
  fullEntries: FullEntry[]
  blockNumber: number
  timestamp: number
  cursor: string
}) {
  try {
    // Upsert the full entries into the cache
    await upsertCachedEntries({ fullEntries, blockNumber, cursor, timestamp })

    const accounts = mapAccounts(fullEntries[0]?.author)

    const actions: Schema.actions.Insertable[] = mapActions({
      fullEntries,
      cursor,
      timestamp,
      blockNumber,
    })

    const geoEntities: Schema.geo_entities.Insertable[] = mapEntities({
      fullEntries,
      blockNumber,
      timestamp,
    })

    const proposals: Schema.proposals.Insertable[] = mapProposals({
      fullEntries,
      blockNumber,
      timestamp,
      cursor,
    })

    const proposed_versions: Schema.proposed_versions.Insertable[] =
      mapProposedVersions({
        fullEntries,
        blockNumber,
        timestamp,
        cursor,
      })

    const spaces: Schema.spaces.Insertable[] = mapSpaces(
      fullEntries,
      blockNumber
    )

    // @TODO: How are duplicate triples being handled in Geo? I know it's possible, but if
    // the triple ID is defined, what does that entail
    const triplesDatabaseTuples = mapTriplesWithActionType(
      fullEntries,
      timestamp,
      blockNumber
    )

    for (const [actionType, triple] of triplesDatabaseTuples) {
      const isCreateTriple = actionType === TripleAction.Create
      const isDeleteTriple = actionType === TripleAction.Delete
      const isAddType = triple.attribute_id === TYPES && isCreateTriple
      const isDeleteType = triple.attribute_id === TYPES && isDeleteTriple

      if (isCreateTriple) {
        await db.upsert('triples', triple, 'id').run(pool)
      }

      if (isDeleteTriple) {
        await db.deletes('triples', { id: triple.id }).run(pool)
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
          .run(pool)
      }

      if (isDeleteType) {
        console.log(
          'Deleting type',
          triple.value_id,
          'to entity',
          triple.entity_id
        )
        await db
          .deletes('geo_entity_types', {
            entity_id: triple.entity_id,
            type_id: triple.value_id,
          })
          .run(pool)
      }
    }

    const versions: Schema.versions.Insertable[] = mapVersions({
      fullEntries,
      blockNumber,
      timestamp,
      cursor,
    })

    console.log('------ UPSERTING ENTRIES ------')
    console.log('Accounts: ', accounts.length)
    console.log('Actions: ', actions.length)
    console.log('Entities: ', geoEntities.length)
    console.log('Proposals: ', proposals.length)
    console.log('Proposed Versions: ', proposed_versions.length)
    console.log('Spaces: ', spaces.length)
    console.log('Triples: ', triplesDatabaseTuples.length)
    console.log('Versions: ', versions.length)

    await Promise.all([
      upsertChunked('accounts', accounts, 'id', {
        updateColumns: db.doNothing,
      }),
      upsertChunked('actions', actions, 'id', {
        updateColumns: db.doNothing,
      }),
      upsertChunked('geo_entities', geoEntities, 'id', {
        updateColumns: [
          'name',
          'description',
          'updated_at',
          'updated_at_block',
        ],
        noNullUpdateColumns: [
          'name',
          'description',
          'updated_at',
          'updated_at_block',
        ],
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
    ])
  } catch (error) {
    console.error(`Error populating entries: ${error} at block ${blockNumber}`)
  }
}
