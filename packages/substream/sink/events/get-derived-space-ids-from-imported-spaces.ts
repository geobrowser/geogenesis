import { Import } from '@geogenesis/sdk/proto';
import { Effect, Either } from 'effect';

import { getFetchIpfsContentEffect } from '../ipfs';
import type { BlockEvent } from '../types';
import { createSpaceId } from '../utils/id';
import type { ProposalProcessed } from './proposals-created/parser';
import { decode } from '~/sink/proto';

function fetchSpaceImportFromIpfs(ipfsUri: string) {
  return Effect.gen(function* (_) {
    yield* _(Effect.logDebug('Fetching space import from IPFS'));
    yield* _(
      Effect.logDebug(`Fetching IPFS content for space import
      ipfsUri: ${ipfsUri}`)
    );

    const fetchIpfsContentEffect = getFetchIpfsContentEffect(ipfsUri);
    const maybeIpfsContent = yield* _(Effect.either(fetchIpfsContentEffect));

    if (Either.isLeft(maybeIpfsContent)) {
      const error = maybeIpfsContent.left;

      switch (error._tag) {
        case 'UnableToParseBase64Error':
          yield* _(Effect.logError(`Unable to parse base64 string ${ipfsUri}. ${String(error)}`));
          break;
        case 'FailedFetchingIpfsContentError':
          yield* _(Effect.logError(`Failed fetching IPFS content from uri ${ipfsUri}. ${String(error)}`));
          break;
        case 'UnableToParseJsonError':
          yield* _(Effect.logError(`Unable to parse JSON when reading content from uri ${ipfsUri}. ${String(error)}`));
          break;
        case 'TimeoutException':
          yield* _(Effect.logError(`Timed out when fetching IPFS content for uri ${ipfsUri}. ${String(error)}`));
          break;
        default:
          yield* _(Effect.logError(`Unknown error when fetching IPFS content for uri ${ipfsUri}. ${String(error)}`));
          break;
      }

      return null;
    }

    const ipfsContent = maybeIpfsContent.right;

    if (!ipfsContent) {
      return null;
    }

    const importResult = yield* _(decode(() => Import.fromBinary(ipfsContent)));

    if (!importResult) {
      return null;
    }

    return createSpaceId({ network: importResult.previousNetwork, address: importResult.previousContractAddress });
  });
}

export function getDerivedSpaceIdsFromImportedSpaces(processedProposals: ProposalProcessed[]) {
  return Effect.gen(function* (_) {
    yield* _(Effect.logDebug(`Gathering IPFS import content for ${processedProposals.length} initial space proposals`));

    const maybeImportsFromIpfs = yield* _(
      Effect.all(
        processedProposals.map(p => {
          return Effect.gen(function* (_) {
            const maybeSpaceId = yield* _(fetchSpaceImportFromIpfs(p.contentUri));

            return {
              pluginAddress: p.pluginAddress,
              contentUri: p.contentUri,
              spaceId: maybeSpaceId,
            };
          });
        }),
        {
          concurrency: 50,
        }
      )
    );

    const proposalsFromIpfs = maybeImportsFromIpfs.flatMap(e => (e ? [e] : [])).flat();
    return proposalsFromIpfs;
  });
}
