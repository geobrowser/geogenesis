import { type CsvMetadata, Id } from '@graphprotocol/grc-20';
import * as Csv from '@std/csv';
import { Effect } from 'effect';
import { Duration, Either, Schedule } from 'effect';
import type { TimeoutException } from 'effect/Cause';
import { decompressSync } from 'fflate';

import { IPFS_GATEWAY } from '../constants/constants';
import type { IntermediateSinkEditProposal, Op, SinkEditProposal } from '../types';

export function postProcessProposalOps(proposal: IntermediateSinkEditProposal, spaceId: string) {
  return Effect.gen(function* (_) {
    const processOps = Effect.forEach(proposal.ops, op => {
      return Effect.gen(function* (_) {
        switch (op.type) {
          case 'SET_TRIPLE':
            return {
              type: 'SET_TRIPLE',
              space: spaceId,
              triple: op.triple,
            } as const;
          case 'DELETE_TRIPLE':
            return {
              type: 'DELETE_TRIPLE',
              space: spaceId,
              triple: {
                attribute: op.triple.attribute,
                entity: op.triple.entity,
                value: {},
              },
            } as const;
          case 'CREATE_RELATION':
            return {
              type: 'CREATE_RELATION',
              space: spaceId,
              relation: op.relation,
            } as const;
          case 'DELETE_RELATION':
            return {
              type: 'DELETE_RELATION',
              space: spaceId,
              relation: op.relation,
            } as const;
          case 'IMPORT_FILE': {
            const ops = yield* _(csvToOps(op.url, op.metadata, spaceId));
            return ops ?? [];
          }
        }
      });
    });

    const ops = yield* _(processOps);

    const sinkProposal: SinkEditProposal = {
      ...proposal,
      ops: ops.flat(), // How slow is this for large datasets?
    };

    return sinkProposal;
  });
}

class InvalidCsvError extends Error {
  _tag = 'InvalidCsvError';
}

function csvToOps(url: string, metadata: CsvMetadata, spaceId: string) {
  return Effect.gen(function* (_) {
    const result = yield* _(getFetchIpfsCsvEffect(url));

    if (!result) {
      return null;
    }

    const csv = Csv.parse(new TextDecoder().decode(decompressSync(result)));

    // @TODO: Validate
    //        2. isId column exists
    //        4. File size?

    // @TODO: Can put CSV + metadata to Op mapping in a separate function to test it

    const ops: Op[] = [];

    let longestRow = 0;

    for (const row of csv) {
      const rowLength = row.length;

      if (rowLength > longestRow) {
        longestRow = rowLength;
      }
    }

    if (longestRow !== metadata.columns.length) {
      yield* _(Effect.fail(new InvalidCsvError('CSV row length does not match metadata')));
    }

    for (const row of csv) {
      // @TODO: Do we enforce that the first column is always the id?
      const rowId = row[0];

      if (!rowId) {
        continue;
      }

      const isValidId = Id.isValid(rowId);

      if (!isValidId) {
        continue;
      }

      for (const [index, cell] of row.entries()) {
        const cellMetadata = metadata.columns[index];

        // This shouldn't happen since we validate previously
        if (!cellMetadata) {
          continue;
        }

        switch (cellMetadata.type) {
          case 'RELATION': {
            const relationType = cellMetadata.id;

            if (!Id.isValid(relationType)) {
              continue;
            }

            // Multiple relations in the same cell are split by a pipe
            const relations = cell.split('|');

            for (const relation of relations) {
              const [relationId, toId] = relation.split('/');

              if (!relationId || !toId) {
                continue;
              }

              const isValidRelationId = Id.isValid(relationId);
              const isValidToId = Id.isValid(toId);

              if (!isValidRelationId || !isValidToId) {
                continue;
              }

              ops.push({
                type: 'CREATE_RELATION',
                space: spaceId,
                relation: {
                  id: relationId,
                  index: cell,
                  fromEntity: rowId,
                  toEntity: toId,
                  type: relationType,
                },
              });
            }

            break;
          }
          // We validate the column types in the metadata during decoding
          // so we know we only get valid value types here.
          default: {
            const attributeId = cellMetadata.id;

            if (!Id.isValid(attributeId) || cell === '') {
              continue;
            }

            ops.push({
              type: 'SET_TRIPLE',
              space: spaceId,
              triple: {
                attribute: cellMetadata.id,
                entity: rowId,
                value: {
                  type: cellMetadata.type,
                  value: cell,
                  options: cellMetadata.options,
                },
              },
            });
            break;
          }
        }
      }
    }

    return ops;
  });
}

class FailedFetchingIpfsContentError extends Error {
  _tag: 'FailedFetchingIpfsContentError' = 'FailedFetchingIpfsContentError';
}

class UnableToParseJsonError extends Error {
  _tag: 'UnableToParseJsonError' = 'UnableToParseJsonError';
}

class UnknownContentTypeError extends Error {
  _tag: 'UnknownContentTypeError' = 'UnknownContentTypeError';
}

export function getFetchIpfsCsvEffect(
  uri: string
): Effect.Effect<
  Buffer | null,
  FailedFetchingIpfsContentError | UnableToParseJsonError | TimeoutException | UnknownContentTypeError,
  never
> {
  return Effect.gen(function* (unwrap) {
    if (uri.startsWith('ipfs://')) {
      const ipfsFetchEffect = Effect.tryPromise({
        try: async () => {
          const parsedCid = uri.replace('ipfs://', '');
          const url = `${IPFS_GATEWAY}${parsedCid}`;

          return await fetch(url, {
            headers: {
              'Content-Type': 'text/csv',
            },
          });
        },
        catch: error => {
          return new FailedFetchingIpfsContentError(`Failed fetching CSV content from uri ${uri}. ${String(error)}`);
        },
      });

      const mainGatewayResponse = yield* unwrap(
        Effect.either(
          // Attempt to fetch with jittered exponential backoff for 30 seconds before failing
          Effect.retry(
            ipfsFetchEffect.pipe(Effect.timeout(Duration.seconds(30))),
            Schedule.exponential(100).pipe(
              Schedule.jittered,
              Schedule.compose(Schedule.elapsed),
              // Retry for 1 minute.
              Schedule.whileOutput(Duration.lessThanOrEqualTo(Duration.seconds(30)))
            )
          )
        )
      );

      if (Either.isLeft(mainGatewayResponse)) {
        yield* unwrap(Effect.logError(`Couldn't fetch IPFS content from uri, ${mainGatewayResponse.left.message}`));
        yield* unwrap(Effect.fail(new FailedFetchingIpfsContentError(`Unable to fetch IPFS content from uri ${uri}`)));
        return null;
      }

      const response = mainGatewayResponse.right;

      return yield* unwrap(
        Effect.tryPromise({
          try: async () => {
            const buffer = await response.arrayBuffer();
            return Buffer.from(buffer);
          },
          catch: error =>
            new UnableToParseJsonError(`Unable to parse JSON when reading content from uri ${uri}. ${String(error)}`),
        })
      );
    }

    yield* unwrap(
      Effect.logError(
        `Encountered unknown content type when decoding content hash ${uri}. IPFS CIDs should start with ipfs://`
      )
    );
    yield* unwrap(Effect.fail(new UnknownContentTypeError(`Unknown content type when decoding content hash ${uri}`)));

    // We only support IPFS URIs or base64 encoded content with the above format
    return null;
  });
}
