import { Effect, Either } from 'effect';

import { getFetchIpfsContentEffect } from '../ipfs';
import { deriveSpaceId } from '../utils/id';
import type { ChainEditPublished } from './schema/edit-published';
import { Decoder } from '~/sink/proto';

function fetchSpaceImportFromIpfs(ipfsUri: string) {
  return Effect.gen(function* (_) {
    yield* _(Effect.logDebug('[SPACE IMPORT] Fetching IPFS content for potential space import'));
    yield* _(
      Effect.logDebug(`[SPACE IMPORT] Fetching IPFS content for potential space import
      ipfsUri: ${ipfsUri}`)
    );

    const fetchIpfsContentEffect = getFetchIpfsContentEffect(ipfsUri);
    const maybeIpfsContent = yield* _(Effect.either(fetchIpfsContentEffect));

    if (Either.isLeft(maybeIpfsContent)) {
      const error = maybeIpfsContent.left;

      switch (error._tag) {
        case 'UnableToParseBase64Error':
          yield* _(Effect.logError(`[SPACE IMPORT] Unable to parse base64 string ${ipfsUri}. ${String(error)}`));
          break;
        case 'FailedFetchingIpfsContentError':
          yield* _(
            Effect.logError(`[SPACE IMPORT] Failed fetching IPFS content from uri ${ipfsUri}. ${String(error)}`)
          );
          break;
        case 'UnableToParseJsonError':
          yield* _(
            Effect.logError(
              `[SPACE IMPORT] Unable to parse JSON when reading content from uri ${ipfsUri}. ${String(error)}`
            )
          );
          break;
        case 'TimeoutException':
          yield* _(
            Effect.logError(`[SPACE IMPORT] Timed out when fetching IPFS content for uri ${ipfsUri}. ${String(error)}`)
          );
          break;
        default:
          yield* _(
            Effect.logError(
              `[SPACE IMPORT] Unknown error when fetching IPFS content for uri ${ipfsUri}. ${String(error)}`
            )
          );
          break;
      }

      return null;
    }

    const ipfsContent = maybeIpfsContent.right;

    if (!ipfsContent) {
      return null;
    }

    const importResult = yield* _(Decoder.decodeImport(ipfsContent));

    if (!importResult) {
      return null;
    }

    return deriveSpaceId({ network: importResult.previousNetwork, address: importResult.previousContractAddress });
  });
}

export function getDerivedSpaceIdsFromImportedSpaces(processedProposals: ChainEditPublished[]) {
  return Effect.gen(function* (_) {
    yield* _(
      Effect.logDebug(
        `[SPACE IMPORT] Gathering IPFS import content for ${processedProposals.length} initial space proposals`
      )
    );

    const maybeImportsFromIpfs = yield* _(
      Effect.forEach(
        processedProposals,
        p => {
          return Effect.gen(function* (_) {
            const maybeSpaceId = yield* _(fetchSpaceImportFromIpfs(p.contentUri));

            return {
              pluginAddress: p.pluginAddress,
              contentUri: p.contentUri,
              spaceId: maybeSpaceId,
            };
          });
        },
        {
          concurrency: 50,
        }
      )
    );

    const proposalsFromIpfs = maybeImportsFromIpfs.flatMap(e => (e ? [e] : [])).flat();
    return proposalsFromIpfs;
  });
}
