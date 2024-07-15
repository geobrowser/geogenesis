import { gql, makeExtendSchemaPlugin } from 'graphile-utils';

import { getChainHead } from './get-block-meta';
import { getCursor } from './get-cursor';
import { GEO_SUBGRAPH_DEPLOYMENT_ID } from './config';

const INITIAL_GEO_BLOCK = 620;
const INITIAL_BLOCK_HASH = '0xf731eaa44bd7a55e25a0252e1aa85e023a3d35d64763ae4ad6e713699a218ca2';
const GEO_NETWORK_ID = 'geo';

export const IndexingStatusPlugin = makeExtendSchemaPlugin(() => {
  return {
    typeDefs: gql`
      scalar Bytes

      type Block {
        hash: Bytes!
        number: BigInt!
      }

      type EarliestBlock {
        hash: Bytes!
        number: BigInt!
      }

      enum Health {
        "Subgraph syncing normally"
        healthy
        "Subgraph syncing but with errors"
        unhealthy
        "Subgraph halted due to errors"
        failed
      }

      type EthereumIndexingStatus {
        network: String!
        chainHeadBlock: Block
        earliestBlock: EarliestBlock
        latestBlock: Block
        lastHealthyBlock: Block
      }

      type SubgraphIndexingStatus {
        subgraph: String!
        synced: Boolean!
        health: Health!
        fatalError: SubgraphError
        chains: [EthereumIndexingStatus!]!
        entityCount: BigInt!
        node: String
        paused: Boolean!
        historyBlocks: Int!
      }

      type SubgraphError {
        message: String!

        block: Block
        handler: String

        deterministic: Boolean!
      }

      extend type Query {
        indexingStatuses(subgraphs: [String!]): [SubgraphIndexingStatus]
      }
    `,
    resolvers: {
      Query: {
        async indexingStatuses(_: any, args: any) {
          const { subgraphs } = args;
          if (subgraphs && subgraphs.length !== 0 && !subgraphs.includes(GEO_SUBGRAPH_DEPLOYMENT_ID)) {
            return [];
          }
          const [head, cursor] = await Promise.all([getChainHead(), getCursor()]);

          let latestBlock: { number: number; hash: string;} = {
            number: INITIAL_GEO_BLOCK,
            hash: INITIAL_BLOCK_HASH,
          };

          if (cursor) {
            latestBlock = {
              number: cursor.block_number,
              hash: cursor.block_hash,
            };
          }

          return [
            {
              subgraph: GEO_SUBGRAPH_DEPLOYMENT_ID,
              synced: true,
              health: 'healthy',
              entityCount: 0,
              paused: false,
              node: 'geo-node',
              historyBlocks: 0,
              fatalError: null,
              chains: [
                {
                  network: GEO_NETWORK_ID,
                  chainHeadBlock: {
                    number: head.number,
                    hash: head.hash,
                  },
                  earliestBlock: {
                    number: INITIAL_GEO_BLOCK,
                    hash: '0x0',
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
