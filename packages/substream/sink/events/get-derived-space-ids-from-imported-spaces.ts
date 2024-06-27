import { ActionType, Import, IpfsMetadata } from '@geogenesis/sdk/proto';
import { Effect, Either } from 'effect';

import { getFetchIpfsContentEffect } from '../ipfs';
import type { BlockEvent } from '../types';
import { createSpaceId } from '../utils/id';
import { slog } from '../utils/slog';
import { Decoder, decode } from '~/sink/proto';

function fetchSpaceImportFromIpfs(ipfsUri: string, block: BlockEvent) {
  return Effect.gen(function* (_) {
    slog({
      message: `Fetching IPFS content for space import
        ipfsUri:       ${ipfsUri}`,
      requestId: block.requestId,
    });

    const fetchIpfsContentEffect = getFetchIpfsContentEffect(ipfsUri);
    const maybeIpfsContent = yield* _(Effect.either(fetchIpfsContentEffect));

    if (Either.isLeft(maybeIpfsContent)) {
      const error = maybeIpfsContent.left;

      switch (error._tag) {
        case 'UnableToParseBase64Error':
          console.error(`Unable to parse base64 string ${ipfsUri}`, error);
          break;
        case 'FailedFetchingIpfsContentError':
          console.error(`Failed fetching IPFS content from uri ${ipfsUri}`, error);
          break;
        case 'UnableToParseJsonError':
          console.error(`Unable to parse JSON when reading content from uri ${ipfsUri}`, error);
          break;
        case 'TimeoutException':
          console.error(`Timed out when fetching IPFS content for uri ${ipfsUri}`, error);
          break;
        default:
          console.error(`Unknown error when fetching IPFS content for uri ${ipfsUri}`, error);
          break;
      }

      return null;
    }

    const ipfsContent = maybeIpfsContent.right;

    if (!ipfsContent) {
      return null;
    }

    const validIpfsMetadata = yield* _(decode(() => IpfsMetadata.fromBinary(ipfsContent)));

    if (!validIpfsMetadata) {
      // @TODO: Effectify error handling
      console.error('Failed to parse IPFS metadata', validIpfsMetadata);
      return null;
    }

    switch (validIpfsMetadata.type) {
      // The initial content set might not be an Edit and instead be an import. If it's an import
      // we need to turn every Edit in the import into an individual EditProposal.
      case ActionType.IMPORT_SPACE:
        // @TODO: Map every edit in the import into many EditProposals. We then need to flatten
        // these later
        const importResult = yield* _(decode(() => Import.fromBinary(ipfsContent)));

        if (!importResult) {
          return null;
        }

        return createSpaceId({ network: importResult.previousNetwork, address: importResult.previousContractAddress });
    }

    return null;
  });
}

export function getDerivedSpaceIdsFromImportedSpaces(ipfsUris: string[], block: BlockEvent) {
  return Effect.gen(function* (_) {
    slog({
      requestId: block.requestId,
      message: `Gathering IPFS import content for ${ipfsUris.length} initial space proposals`,
    });

    const maybeImportsFromIpfs = yield* _(
      Effect.all(
        ipfsUris.map(uri => fetchSpaceImportFromIpfs(uri, block)),
        {
          concurrency: 20,
        }
      )
    );

    const proposalsFromIpfs = maybeImportsFromIpfs.flatMap(e => (e ? [e] : [])).flat();
    return proposalsFromIpfs;
  });
}
