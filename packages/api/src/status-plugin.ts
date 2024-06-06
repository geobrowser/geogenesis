import { gql, makeExtendSchemaPlugin } from 'graphile-utils';

import { db } from './db';

const INITIAL_GEO_BLOCK = 620;
const INITIAL_BLOCK_HASH = '0xf731eaa44bd7a55e25a0252e1aa85e023a3d35d64763ae4ad6e713699a218ca2';

export const IndexingStatusPlugin = makeExtendSchemaPlugin(build => {
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
        indexingStatuses: [SubgraphIndexingStatus]
      }
    `,
    resolvers: {
      Query: {
        async indexingStatuses() {
          await db.connect();
          const [head, { rows }] = await Promise.all([
            getChainHead(),
            db.query(`select block_number from public.cursors`),
          ]);
          await db.end();

          const cursor = rows[0] as { block_number: number } | undefined;

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
              subgraph: 'geo',
              chains: [
                {
                  network: 'geo',
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

async function getChainHead() {
  const result = await fetch(process.env.CHAIN_RPC!, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'eth_getBlockByNumber',
      params: ['latest', false],
      id: 1,
    }),
  });

  // @TODO: Errors, retries
  const json = (await result.json()) as {
    result: {
      hash: string; // hex encoded
      number: string; // hex encoded
    };
  };

  const head = {
    hash: json.result.hash,
    number: Number(json.result.number),
  };

  return head;
}

async function getBlockMetadata(blockNumber: number) {
  const result = await fetch(process.env.CHAIN_RPC!, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'eth_getBlockByNumber',
      params: [`0x${blockNumber.toString(16)}`, false],
      id: 1,
    }),
  });

  // @TODO: Errors, retries
  const json = (await result.json()) as {
    result: {
      hash: string; // hex encoded
      number: string; // hex encoded
      timestamp: string; // hex encoded
    };
  };

  return {
    hash: json.result.hash,
    timestamp: Number(json.result.timestamp),
  };
}
