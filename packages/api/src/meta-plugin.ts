import { gql, makeExtendSchemaPlugin } from 'graphile-utils';
import { getCursor } from './get-cursor';

export const MetaPlugin = makeExtendSchemaPlugin(() => {
  return {
    typeDefs: gql`
      type BlockExt {
        hash: String!
        number: Int!
        timestamp: Int!
      }

      type Meta {
        block: BlockExt!
      }

      extend type Query {
        _meta: Meta
      }
    `,
    resolvers: {
      Query: {
        async _meta() {
          const cursor = await getCursor();

          return {
            block: {
              number: cursor?.block_number ?? 0,
              hash: cursor?.block_hash ?? "0x",
              timestamp: cursor?.block_timestamp ?? 0,
            },
          };
        },
      },
    },
  };
});
