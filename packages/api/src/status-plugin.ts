import { gql, makeExtendSchemaPlugin } from 'graphile-utils';

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
        # earliestBlock: EarliestBlock
        # latestBlock: Block
        # lastHealthyBlock: Block
      }

      type SubgraphError {
        message: String!

        # Context for the error.
        block: Block
        handler: String

        # true means we have certainty that the error is deterministic.
        deterministic: Boolean!
      }

      enum Health {
        "Subgraph syncing normally"
        healthy
        "Subgraph syncing but with errors"
        unhealthy
        "Subgraph halted due to errors"
        failed
      }

      type SubgraphIndexingStatus {
        subgraph: String!
        synced: Boolean!

        # Note that the health can be implied from fatalError and nonFatalErrors:
        # - If fatalError is non-null, then health is 'failed'.
        # - Else if nonFatalErrors is non-empty, then health is 'unhealthy'.
        # - Else health is 'healthy'.
        health: Health!

        "If the subgraph has failed, this is the error caused it"
        fatalError: SubgraphError

        "Sorted from first to last, limited to first 1000"
        nonFatalErrors: [SubgraphError!]!
        chains: [ChainIndexingStatus!]!
        entityCount: BigInt!
        node: String
        paused: Boolean!
        historyBlocks: Int!
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
              synced: true,
              health: 0,
              fatalError: null,
              entityCount: 0,
              node: 'geo',
              paused: false,
              chains: [
                {
                  network: 'geo',
                  chainHeadBlock: {
                    number: head.number,
                    hash: head.hash,
                  },
                },
              ],
              nonFatalErrors: [],
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
