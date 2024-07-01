import { ActionType, Import, IpfsMetadata } from '@geogenesis/sdk/proto';
import { Effect, Either } from 'effect';

import { getFetchIpfsContentEffect } from '../ipfs';
import type { BlockEvent } from '../types';
import { createSpaceId } from '../utils/id';
import { slog } from '../utils/slog';
import type { ProposalProcessed } from './proposals-created/parser';
import { decode } from '~/sink/proto';

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

    const importResult = yield* _(decode(() => Import.fromBinary(ipfsContent)));

    if (!importResult) {
      return null;
    }

    return createSpaceId({ network: importResult.previousNetwork, address: importResult.previousContractAddress });
  });
}

export function getDerivedSpaceIdsFromImportedSpaces(processedProposals: ProposalProcessed[], block: BlockEvent) {
  return Effect.gen(function* (_) {
    slog({
      requestId: block.requestId,
      message: `Gathering IPFS import content for ${processedProposals.length} initial space proposals`,
    });

    const maybeImportsFromIpfs = yield* _(
      Effect.all(
        processedProposals.map(p => {
          return Effect.gen(function* (_) {
            const maybeSpaceId = yield* _(fetchSpaceImportFromIpfs(p.contentUri, block));

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
