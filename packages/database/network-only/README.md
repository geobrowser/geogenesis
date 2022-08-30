This approach uses plain GraphQL as the top-level API for reading from subgraphs. This would require another API for writing to IPFS + the contract. In this approach we're relying on the caching mechanism from swr instead of using an in-memory state store.

**This means there's no internal, typed, representation for our data at all and instead we just get back whatever type the GraphQL generates for us based on the query.**

### Design

All we do is provide functions for reading and writing data. The rest of the bindings and functionality are done through swr and its React hooks.

### Requirements from database/ root README

- Easy DX

  ?? Surface area for interacting with mutations and reads is mostly from the same place

  ?? Easy to mock and test the entire read/write system using dependency injection

  -- Types could be annoying to reason about since we have to use types generated from GraphQL
  -- We have to generate types whenever we change the schema or the queries in the app

- Simple as possible
- Reactive
  ++ swr can re-run queries if there has been a mutation (see mutate API)
  ++ We're using swr as the "react bindings" in this case since all we're doing is network calls and not actually interacting with a local in-memory store that we control.
- State is subscribable
  -- This approach has no "subscribability" aspect at all since we're relying on caching instead of in-memory state
- Cacheable
  ++ We're caching through swr
- "Sync"-able
  ++ swr has a polling mechanism we can use internally
- Optimistic updates
  ++ swr has optimistic updates (see mutate API)
  ++ Caches should be break-able when there's a write from the user

  ?? State should be rollback-able if there's an error

- Observable + debuggable
  We should be able to observe changes to state and the call paths throughout our system to understand what's happening internally if there are errors.

  ++ We write our own functions, so can add whatever observability functionality on top of those as we want. Additionally, swr has middleware so we can write observability directly into swr.

### Notes

This approach using swr does a lot of what we want for v1 out of the box. It also has middlewares so we can extend the functionality on-fetch or add things like observability.

We can probably extend this approach of "plain functions" to a future ORM-y approach where we write out own library for syncing.
