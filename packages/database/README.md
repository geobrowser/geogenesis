Right now the /database directory is for experimenting with different local state/db/network implementations. For now we're mocking the IPFS, Contract, and Subgraphs.

### /network-only

The `/network-only` directory houses an approach that relies on swr for caching. We simply create functions for reading from and writing to remote resources. swr handles all the other functionality like caching, optimistic updates, polling, etc.

**Pros**

- Less library code to maintain at the expense of more complex React code
- swr/RQ/apollo/urql/suspense has a lot of functionality that we want out of the box

**Cons**

- There will be more code in React-land to manage things like optimistic updates and async states
- Async network calls will "infect" our React components as the fetching happens in the component
- Types are more complex in app since we rely on GraphQL types instead of static app-specific types

### /sync

The `/sync` directory houses an approach that relies on observable-based stores for in-memory state. It also has a lightweight/naive polling and syncing system to keep local app state up-to-date with remote state. This approach is more hand-crafted and complex, but most of the complexity is abstracted to the sync package. This leaves our React components very pure and easy to grok. Almost all functionality lives outside of React with a thin React hook binding to keep UI up-to-date.

**Pros**

- React code becomes incredibly simple as most complexity is abstracted to the sync library
- There's no async interactions in our React components which makes things easier to reason about.
- Since we manage our own store we have more granular control over features we care about like observability, optimistic updates, etc.
- Sync mechanism hides all the async logic that makes React code complex
- With an ORM-y approach on top of the sync library types should be less complex and easier to reason about.

**Cons**

- Library code will be complex for the benefit of less complex React code
- The observables, syncing and patching mechanism may become complex as we add more app-specific state
- Rxjs is powerful, but reactive programming can be complex to reason about if you're new to it
