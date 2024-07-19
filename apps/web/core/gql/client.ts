import { cacheExchange, createClient, fetchExchange, gql } from '@urql/next';
import { registerUrql } from '@urql/next/rsc';

import { Environment } from '../environment';

export const makeClient = () =>
  createClient({
    url: Environment.getConfig().api,
    exchanges: [cacheExchange, fetchExchange],
  });

export const client = makeClient();

export const { getClient } = registerUrql(makeClient);
