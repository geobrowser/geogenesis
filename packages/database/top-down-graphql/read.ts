import { createGraphQlClient, graphqlFetch } from '../graphql-client'
import gql from 'graphql-tag'

// -------------------------------------
// In a real implementation with a backend we would be using a graphQL client like this
// with actual GQL either called directly from components or mapped to a lower level
// function call like "getFacts()"
const client = createGraphQlClient()

const FACTS_QUERY = gql`
  query something {
    attributes {
      id
    }

    values {
      id
    }
  }
`
// End of unused implementations we would use in an actual implementation with a backend
// --------------------------------------

type ResolvedFact = {
  id: string
  entityId: string
  attribute: string
  value: string | number
}

const MOCK_FACTS: ResolvedFact[] = [
  {
    id: '21340987',
    entityId: '1234567890',
    attribute: 'name',
    value: 'Jesus Christ',
  },
]

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// We aren't using the actual gqlFetch since we need to simulate a "real" backend for this
// implementation. We have an in-memory object that stores all our facts that we just read from.
async function mockedFetch(id?: string) {
  // Adding an artificial delay so we can test the caching in-app
  await sleep(2000)

  // or .find
  if (id) return MOCK_FACTS.filter((fact) => fact.id === id)
  return MOCK_FACTS
}

export async function getFacts() {
  return await mockedFetch()
}

export async function getFact(id: string) {
  return await mockedFetch(id)
}
