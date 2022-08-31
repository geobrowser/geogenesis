import { gql, request } from 'graphql-request'

const ensQuery = gql`
  query getEnsName($id: ID!) {
    account(id: $id) {
      id
      domains {
        name
      }
    }
  }
`

type EnsResult = {
  account: {
    id: string
    domains: {
      name: string
    }[]
  }
}

export async function getEnsName(address: string) {
  try {
    const maybeEns = await request<EnsResult>(
      `https://api.thegraph.com/subgraphs/name/ensdomains/ens`,
      ensQuery,
      { id: address.toLowerCase() } // subgraph expects addresses to be lowercase
    )

    if (!maybeEns.account) return null
    return maybeEns.account.domains?.[0].name
  } catch (e) {
    console.error('Failed in getEnsName for address', address, e)
    return null
  }
}
