import { Effect, Either } from 'effect';

import { getFetchIpfsContentEffect } from '~/sink/ipfs';
import { Decoder } from '~/sink/proto';
import type { Op, SetTripleOp } from '~/sink/types';

/**
 * We don't know the content type of the proposal until we fetch the IPFS content and parse it.
 *
 * 1. Verify that the space exists for the plugin address
 * 2. Fetch the IPFS content
 * 3. Parse the IPFS content to get the "type"
 * 4. Return an object matching the type and the expected contents.
 *
 * Later on we map this to the database schema and write the proposal to the database.
 */
export function getProposalFromIpfs(contentUri: string) {
  return Effect.gen(function* (_) {
    yield* _(Effect.logDebug('[FETCH PROPOSAL] Fetching proposal from IPFS'));

    yield* _(
      Effect.logDebug(`[FETCH PROPOSAL] Fetching IPFS content for proposal
      contentUri:   ${contentUri}`)
    );

    const fetchIpfsContentEffect = getFetchIpfsContentEffect(contentUri);
    const maybeIpfsContent = yield* _(Effect.either(fetchIpfsContentEffect));

    if (Either.isLeft(maybeIpfsContent)) {
      const error = maybeIpfsContent.left;

      switch (error._tag) {
        case 'UnableToParseBase64Error':
          yield* _(Effect.logError(`[FETCH PROPOSAL] Unable to parse base64 string ${contentUri}. ${String(error)}`));
          break;
        case 'FailedFetchingIpfsContentError':
          yield* _(
            Effect.logError(`[FETCH PROPOSAL] Failed fetching IPFS content from uri ${contentUri}. ${String(error)}`)
          );
          break;
        case 'UnableToParseJsonError':
          yield* _(
            Effect.logError(
              `[FETCH PROPOSAL] Unable to parse JSON when reading content from uri ${contentUri}. ${String(error)}`
            )
          );
          break;
        case 'TimeoutException':
          yield* _(
            Effect.logError(
              `[FETCH PROPOSAL] Timed out when fetching IPFS content for uri ${contentUri}. ${String(error)}`
            )
          );
          break;
        default:
          yield* _(
            Effect.logError(
              `[FETCH PROPOSAL] Unknown error when fetching IPFS content for uri ${contentUri}. ${String(error)}`
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

    const validIpfsMetadata = yield* _(Decoder.decodeIpfsMetadata(ipfsContent));

    if (!validIpfsMetadata) {
      // @TODO: Effectify error handling
      yield* _(Effect.logError(`[FETCH PROPOSAL] Failed to parse IPFS metadata for proposal ${validIpfsMetadata}`));
      return null;
    }

    switch (validIpfsMetadata.type) {
      case 'ADD_EDIT': {
        const parsedContent = yield* _(Decoder.decodeEdit(ipfsContent));

        // Subspace proposals are only emitted by the voting plugin
        if (!parsedContent) {
          return null;
        }

        console.log('parsedContent', parsedContent);

        const mappedProposal = {
          ops: parsedContent.ops.map((op): Op => {
            switch (op.type) {
              case 'SET_TRIPLE':
                return {
                  type: 'SET_TRIPLE',
                  space: '',
                  triple: op.triple,
                } as SetTripleOp;
              case 'DELETE_TRIPLE':
                return {
                  type: 'DELETE_TRIPLE',
                  space: '',
                  triple: {
                    attribute: op.triple.attribute,
                    entity: op.triple.entity,
                    value: {},
                  },
                };
              case 'CREATE_RELATION':
                return {
                  type: 'CREATE_RELATION',
                  space: '',
                  relation: op.relation,
                };
              case 'DELETE_RELATION':
                return {
                  type: 'DELETE_RELATION',
                  space: '',
                  relation: op.relation,
                };
            }
          }),
        };

        return mappedProposal;
      }

      default:
        yield* _(Effect.logError(`[FETCH PROPOSAL] Unsupported content type ${validIpfsMetadata.type}`));
        return null;
    }
  });
}

await Effect.runPromise(getProposalFromIpfs('ipfs://bafkreigjb5bejzykgfycjnieva4qnj5vx73enmyq22i6mqdcppplvc7nsy'));
