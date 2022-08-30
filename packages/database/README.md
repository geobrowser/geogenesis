Right now the /database directory is for experimenting with different local state/db/network implementations. For now we're mocking the IPFS, Contract, and Subgraphs.

### Important local state/network properties

- Easy DX

  - Surface area for interacting with mutations and reads is mostly from the same place
  - Easy to mock and test the entire read/write system using dependency injection

- Simple as possible
- Reactive
  - I want to have the latest backend data
  - I want to do something when the backend data changes
    We may have places where we aren't rendering the data, but we derive data from it or trigger a side effect when that data changes
- State is subscribable
  - Do we care about "state" being subscribable? or do moreso care that network calls are subscribable? Depends on the implementation
- Cacheable
  This can be through the network layer or through an in-memory data store
  We can use the graphql caching mechanism
  Previous issues with gql caching is mutations not busting the cache the way we expect
  Caches should be break-able when there's a write from the user
- "Sync"-able
  We should keep clients up-to-date using a basic "sync" mechanism that polls our GraphQL endpoint for now
- Optimistic updates
  State should be rollback-able if there's an error
- Observable + debuggable
  We should be able to observe changes to state and the call paths throughout our system to understand what's happening internally if there are errors.
- "Global state" lives outside of this library.
  This library is purely for handling reads, writes, and caching for IPFS, Contracts, and Subgraphs. This is basically react-query, swr, et al with real-time sync...?
