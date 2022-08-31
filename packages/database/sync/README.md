The sync approach works like this:

- We read from and write to a local store
- The store is in charge of sending off requests when mutations happens and reading from the backend periodically

We control most aspects of our state and network management with this approach. This has several benefits like more granular control, better observability, and better error handling. The APIs are also very simple to grok at the component level as most of the functionality is abstracted to the sync system. Additionally there's basically 0 async logic in components which is very ergonomic at the component level.

### Design

There are a few main pillars to this approach:

- A background sync system that fetches data from the network periodically and merges it with the app state
- Optimistic updates to keep the UI fast while the background sync mechanism runs
- In-memory store with relevant app data to keep the app fast

Our "API" runs a sync job periodically to make sure the app is up-to-date. When mutations are executed by the user these are optimistically patched into the app state. When syncing happens the app merges the app state with the remote state.

### Requirements from database/ root README

- Easy DX

  ++ Surface area for interacting with mutations and reads is mostly from the same place.

  ++ Easy to mock and test the entire read/write system using dependency injection

- Simple as possible
  This approach is a little more complex than the network-only approach, however components become much simpler since there's no async fetching logic in components.
- Reactive

  ++ The whole system is based on observables so is completely reactive.

  ++ The React bindings are very thin as all we do is subscribe to observables using useExternalSyncStore

- State is subscribable

  -- Completely observable-based so subscribable state is a first-class citizen.

- Cacheable

  ?? We are "caching" with an in-memory store. This method relies on optimistic updates and background syncing rather than caching.

- "Sync"-able

  Our "API" service has ability to sync with any network endpoints we want on an interval.

- Optimistic updates

  ++ Optimistic updates are handled at the store-level whenever users mutate data in the store.

  ++ We have an in-memory store instead of caching so we can manipulate the store however we want.

  ?? State should be rollback-able if there's an error

- Observable + debuggable
  ++ We're in complete control of the system functionality so can add observability wherever we want.

### Notes

This approach is more complex than network-only at the package-level, but is less complex than the network-only approach at the component level. There is virtually 0 async code in components which is incredibly ergonomic. Things like optimistic updates and syncing is all abstracted to the sync system so components never have to care about it.
