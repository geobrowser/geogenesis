import type { CsvMetadata } from '@graphprotocol/grc-20';
import * as Csv from '@std/csv';
import { Effect } from 'effect';
import { Duration, Either, Schedule } from 'effect';
import type { TimeoutException } from 'effect/Cause';
import { decompressSync } from 'fflate';

import { IPFS_GATEWAY } from '../constants/constants';
import type { IntermediateSinkEditProposal, SinkEditProposal } from '../types';

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
            const csv = yield* _(csvToOps(op.url, op.metadata));
            throw new Error('Not implemented');
          }
        }
      });
    });

    const ops = yield* _(processOps);

    const sinkProposal: SinkEditProposal = {
      ...proposal,
      ops,
    };

    return sinkProposal;
  });
}

function csvToOps(url: string, metadata: CsvMetadata) {
  return Effect.gen(function* (_) {
    const result = yield* _(getFetchIpfsCsvEffect(url));

    if (!result) {
      return null;
    }

    const data = decompressSync(result);
    const parsed = Csv.parse(new TextDecoder().decode(data));

    console.log('result', parsed, metadata);
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
