import { gql, makeExtendSchemaPlugin } from 'graphile-utils';
import { getBlockMetadata } from './get-block-meta';
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
          const blockMetadata = cursor ? await getBlockMetadata(cursor.block_number) : { hash: '', timestamp: 0 };

          return {
            block: {
              number: cursor?.block_number ?? 0,
              hash: blockMetadata.hash,
              timestamp: blockMetadata.timestamp,
            },
          };
        },
      },
    },
  };
});
