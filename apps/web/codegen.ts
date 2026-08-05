import type { CodegenConfig } from '@graphql-codegen/cli';

const config: CodegenConfig = {
  // v2 staging testnet. The v1 endpoint (testnet-api.geobrowser.io) still
  // exists but is missing types added in the contracts v2 migration such as
  // SpaceVotingSetting — regenerating against it drops those fields.
  schema: 'https://testnet-api-v2.geobrowser.io/graphql',
  documents: ['./**/*.tsx'],
  generates: {
    './core/gql/': {
      preset: 'client',
    },
  },
};
export default config;
