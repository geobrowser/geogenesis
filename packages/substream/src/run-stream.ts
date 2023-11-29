import { createGrpcTransport } from '@connectrpc/connect-node'
import {
  authIssue,
  createAuthInterceptor,
  createRegistry,
} from '@substreams/core'
import { readPackageFromFile } from '@substreams/manifest'
import { Data, Effect, Stream } from 'effect'
import { MANIFEST, START_BLOCK } from './constants/constants'
import { readCursor, writeCursor } from './cursor'
import { populateWithFullEntries } from './populate-entries'
import { handleRoleGranted, handleRoleRevoked } from './populate-roles'
// import { createSink, createStream } from './substreams.js/sink/src'
import { invariant } from './utils/invariant'
import { logger } from './utils/logger'
import {
  ZodEntryStreamResponse,
  ZodRoleChangeStreamResponse,
  type FullEntry,
} from './zod'
import { createSink, createStream } from '@substreams/sink'
import { fetchIpfsContent } from './utils/actions'
import { upsertCachedEntries } from './populate-cache'
import { parseValidFullEntries } from './parse-valid-full-entries'

export class InvalidPackageError extends Data.TaggedClass(
  'InvalidPackageError'
)<{
  readonly cause: unknown
  readonly message: string
}> {}

export function getStreamEffect(startBlockNum?: number) {
  const program = Effect.gen(function* (_) {
    const substreamsEndpoint = process.env.SUBSTREAMS_ENDPOINT
    invariant(substreamsEndpoint, 'SUBSTREAMS_ENDPOINT is required')
    const substreamsApiKey = process.env.SUBSTREAMS_API_KEY
    invariant(substreamsApiKey, 'SUBSTREAMS_API_KEY is required')
    const authIssueUrl = process.env.AUTH_ISSUE_URL
    invariant(authIssueUrl, 'AUTH_ISSUE_URL is required')

    logger.enable('pretty')
    logger.info('Logging enabled')

    const substreamPackage = readPackageFromFile(MANIFEST)

    logger.info('Substream package downloaded')

    const { token } = yield* _(
      Effect.tryPromise({
        try: () => authIssue(substreamsApiKey, authIssueUrl),
        catch: () => new Error(`Could not read package at path ${MANIFEST}`),
      })
    )

    const outputModule = 'geo_out'
    const productionMode = true
    // const finalBlocksOnly = true; TODO - why doesn't createStream accept this option?

    const startCursor = yield* _(
      Effect.tryPromise({
        try: () => readCursor(),
        catch: () => new Error(`Could not read cursor`),
      })
    )

    const registry = createRegistry(substreamPackage)

    const transport = createGrpcTransport({
      baseUrl: substreamsEndpoint,
      httpVersion: '2',
      interceptors: [createAuthInterceptor(token)],
    })

    const stream = createStream({
      connectTransport: transport,
      substreamPackage,
      outputModule,
      startCursor: startBlockNum ? undefined : startCursor,
      startBlockNum: startBlockNum || START_BLOCK,
      productionMode,
    })

    let entriesQueue = Promise.resolve()

    const sink = createSink({
      handleBlockScopedData: (message) =>
        Effect.gen(function* (_) {
          const cursor = message.cursor
          const blockNumber = Number(message.clock?.number.toString())
          const timestamp = Number(message.clock?.timestamp?.seconds.toString())

          if (blockNumber % 1000 === 0) {
            console.log(`@ Block ${blockNumber}`)
          }

          yield* _(
            Effect.tryPromise({
              try: () => writeCursor(cursor, blockNumber),
              catch: () => new Error(`Could not write cursor`),
            })
          )

          const mapOutput = message.output?.mapOutput

          if (!mapOutput || mapOutput?.value?.byteLength === 0) {
            return
          }

          const unpackedOutput = mapOutput.unpack(registry)
          if (!unpackedOutput) {
            console.error('Failed to unpack substream message', mapOutput)
            return
          }

          const jsonOutput = unpackedOutput.toJson({ typeRegistry: registry })

          const entryResponse = ZodEntryStreamResponse.safeParse(jsonOutput)
          const roleChangeResponse =
            ZodRoleChangeStreamResponse.safeParse(jsonOutput)

          if (entryResponse.success) {
            console.log(
              'Processing ',
              entryResponse.data.entries.length,
              ' entries'
            )

            const entries = entryResponse.data.entries
            const validFullEntries = yield* _(
              Effect.tryPromise({
                try: async () => {
                  const maybeResponses: (FullEntry | null)[] =
                    await Promise.all(
                      entries.map(async (entry) => {
                        const ipfsContent = await fetchIpfsContent(entry.uri)
                        if (!ipfsContent) {
                          return null
                        }
                        return {
                          ...entry,
                          uriData: ipfsContent,
                        }
                      })
                    )
                  const nonValidatedFullEntries = maybeResponses.filter(
                    (response): response is FullEntry => response !== null
                  )
                  return parseValidFullEntries(nonValidatedFullEntries)
                },
                catch: () =>
                  new Error(
                    `Could not parse actions from URI for entries in block`
                  ),
              })
            )

            yield* _(
              Effect.tryPromise({
                try: () =>
                  upsertCachedEntries({
                    fullEntries: validFullEntries,
                    blockNumber,
                    cursor,
                    timestamp,
                  }),
                catch: () =>
                  new Error(`Could not upsert cached entries in block`),
              })
            )

            // @TODO: This should write all of the actions we need to take to an Effect.Queue
            // The Effect.Queue will process each action in a separate process
            entriesQueue = entriesQueue.then(() => {
              return populateWithFullEntries({
                fullEntries: validFullEntries,
                blockNumber,
                cursor,
                timestamp,
              })
            })
          }

          if (roleChangeResponse.success) {
            console.log(
              'Processing ',
              roleChangeResponse.data.roleChanges.length,
              ' role changes'
            )

            for (const roleChange of roleChangeResponse.data.roleChanges) {
              const { granted, revoked } = roleChange

              if (granted) {
                handleRoleGranted({
                  roleGranted: granted,
                  blockNumber,
                  cursor,
                  timestamp,
                })
              }

              if (revoked) {
                handleRoleRevoked({
                  roleRevoked: revoked,
                  blockNumber,
                  cursor,
                  timestamp,
                })
              }
            }
          }

          if (!entryResponse.success && !roleChangeResponse.success) {
            console.error('Failed to parse substream message', unpackedOutput)
          }
        }),
      handleBlockUndoSignal: (message) =>
        Effect.gen(function* (_) {
          const blockNumber = Number(message.lastValidBlock?.number.toString())
          yield* _(
            Effect.tryPromise({
              try: () => writeCursor(message.lastValidCursor, blockNumber),
              catch: () => new Error(`Could not write cursor`),
            })
          )
        }),
    })

    return yield* _(Stream.run(stream, sink))
  })

  return program
}
