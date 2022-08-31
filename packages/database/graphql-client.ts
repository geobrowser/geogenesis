import { DocumentNode } from 'graphql'

interface IGraphQlClient {
  fetch: <T>(query: DocumentNode) => Promise<T>
}

export async function graphqlFetch(
  client: IGraphQlClient,
  query: DocumentNode
) {
  return await client.fetch(query)
}

export function createGraphQlClient(): IGraphQlClient {
  // TODO(baiirun): Fix the return value from here
  const fetch = <T>(query: DocumentNode) => '' as unknown as T

  return { fetch }
}
