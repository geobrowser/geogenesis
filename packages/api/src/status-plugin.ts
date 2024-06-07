import { gql, makeExtendSchemaPlugin } from 'graphile-utils';

import { getBlockMetadata, getChainHead } from './get-block-meta';
import { getCursor } from './get-cursor';

const INITIAL_GEO_BLOCK = 620;
const INITIAL_BLOCK_HASH = '0xf731eaa44bd7a55e25a0252e1aa85e023a3d35d64763ae4ad6e713699a218ca2';
const GEO_NETWORK_ID = 'geo';
const GEO_SUBGRAPH_ID = 'geo';

export const IndexingStatusPlugin = makeExtendSchemaPlugin(() => {
  return {
    typeDefs: gql`
      scalar Bytes

      type Block {
        hash: Bytes!
        number: BigInt!
      }

      type EarliestBlock {
        number: BigInt!
      }

      type ChainIndexingStatus {
        network: String!
        chainHeadBlock: Block
        earliestBlock: EarliestBlock
        latestBlock: Block
        lastHealthyBlock: Block
      }

      type SubgraphIndexingStatus {
        subgraph: String!
        chains: [ChainIndexingStatus!]!
      }

      extend type Query {
        indexingStatuses(subgraphs: [String!]): [SubgraphIndexingStatus]
      }
    `,
    resolvers: {
      Query: {
        async indexingStatuses(deploymentId: string) {
          const [head, cursor] = await Promise.all([getChainHead(), getCursor()]);

          let latestBlock: { number: number; hash: string; timestamp: number } = {
            number: INITIAL_GEO_BLOCK,
            hash: INITIAL_BLOCK_HASH,
            timestamp: 0,
          };

          if (cursor) {
            const block = await getBlockMetadata(cursor.block_number);

            latestBlock = {
              number: cursor.block_number,
              timestamp: block.timestamp,
              hash: block.hash,
            };
          }

          return [
            {
              subgraph: GEO_SUBGRAPH_ID,
              chains: [
                {
                  network: GEO_NETWORK_ID,
                  chainHeadBlock: {
                    number: head.number,
                    hash: head.hash,
                  },
                  earliestBlock: {
                    number: INITIAL_GEO_BLOCK,
                  },
                  latestBlock: latestBlock,
                  latestHealthyBlock: latestBlock,
                },
              ],
            },
          ];
        },
      },
    },
  };
});
