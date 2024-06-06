import { gql, makeExtendSchemaPlugin } from 'graphile-utils';

const INITIAL_GEO_BLOCK = 620;

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
        indexingStatuses: [SubgraphIndexingStatus]
      }
    `,
    resolvers: {
      Query: {
        async indexingStatuses() {
          const head = await getChainHead();

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
                  latestBlock: {
                    // @TODO: Fetch from database
                    number: head.number,
                    hash: head.hash,
                  },
                  latestHealthyBlock: {
                    // @TODO: Fetch from database
                    number: head.number,
                    hash: head.hash,
                  },
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
