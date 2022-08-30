import type { IPFSHTTPClient } from 'ipfs-http-client'

// Not worried about local DB for now

// Not sure what this will actually look like until we get further into design with Devin
export interface IBaseIPFSClient {
  add: IPFSHTTPClient['add']
  block: {
    put: IPFSHTTPClient['block']['put']
    get: IPFSHTTPClient['block']['get']
  }
}

// Not sure what this will look like until we get further into design with Devin
export interface IGeoContract {
  create: () => void
  update: () => void
  get: () => void
  deleted: () => void
}

function createBaseClient(ipld: IBaseIPFSClient, url: string) {
  const api = `${url}/api/v0`

  return {
    add: (api: string) => true,
    block: {
      put: (api: string) => true,
      get: (api: string) => true,
    },
  }
}

export interface IGeoIpfsClient {
  load: () => boolean
  store: () => boolean
}

// Alternatively can be class-based.
// Returns an API with functions for interacting with IPFS
// TODO: Observability
// TODO: Network states
// TODO: Async
export function createGeoIpfsClient(
  ipld: IBaseIPFSClient,
  contract: IGeoContract
): IGeoIpfsClient {
  const client = createBaseClient(ipld, '/')

  const store = () => {
    return client.add('/some/path')
  }

  const load = () => client.block.get('/some/path')

  return {
    store,
    load,
  }
}

// 1. Create base IPLD implementation that we can mock
// 2. Create Geo-specific IPLD implementation that we can mock. This is what is used throughout the app. Has things like "store", "load", "add"?

// Primitives
// Library for making IPFS calls with observability, dependency injection
// Library for making Contract calls with observability, dependency injection
// Library for "state", whatever that means
