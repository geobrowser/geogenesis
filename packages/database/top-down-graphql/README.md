This approach uses plain GraphQL as the top-level API for reading from subgraphs. This would require another API for writing to IPFS + the contract. In this approach we're relying on the caching mechanism from swr instead of using an in-memory state store.

**This means there's no internal, typed, representation for our data at all and instead we just get back whatever type the GraphQL generates for us based on the query.**

- Easy DX

  ?? Surface area for interacting with mutations and reads is mostly from the same place
  ?? Easy to mock and test the entire read/write system using dependency injection
  -- Types could be annoying to reason about since we have to use types generated from GraphQL
  -- We have to generate types whenever we change the schema or the queries in the app

- Simple as possible
- Reactive
  ++ swr can re-run queries if there has been a mutation (see mutate API)
- State is subscribable
  -- This approach has no "subscribability" aspect at all since we're relying on caching instead of in-memory state
- Cacheable
  ++ We're caching through swr or react-query
- "Sync"-able
  ++ swr has a polling mechanism we can use internally
- Optimistic updates
  ++ swr has optimistic updates (see mutate API)
  ?? State should be rollback-able if there's an error
  ?? Caches should be break-able when there's a write from the user
- Observable + debuggable
  We should be able to observe changes to state and the call paths throughout our system to understand what's happening internally if there are errors.
- "Global state" lives outside of this library.
  -- This library is purely for handling reads, writes, and caching for IPFS, Contracts, and Subgraphs. This is basically react-query, swr, et al with real-time sync...?
