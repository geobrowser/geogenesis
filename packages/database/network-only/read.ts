import { createGraphQlClient, graphqlFetch } from '../graphql-client'
import gql from 'graphql-tag'
import { MOCK_FACTS } from './database'

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

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// We aren't using the actual gqlFetch since we need to simulate a "real" backend for this
// implementation. We have an in-memory object that stores all our facts that we just read from.
async function mockedFetch(id?: string) {
  // Simulating hitting network
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
