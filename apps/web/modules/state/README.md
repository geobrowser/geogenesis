**class Facts**
We create a domain model that lives completely outside of React is in charge of several things:
1. Stores the state of local data
2. Exposes APIs for manipulating the local data
3. Can subscribe to a syncing mechanism to keep local state in sync with remote state

This domain model can basically be _any_ implementation we want. Right now we're using a custom class that wraps an rxjs BehaviorSubject, but the same thing can be implemented with any state management we want. 

**useSharedObservable**
We create a hook that bridges the domain model to React. All this hook does is sync the external domain model with the React tree, telling React to update when there are changes.

This hook implementation might change/not be needed depending on the state implementation we choose.

**useFacts**
We can create usecase-specific hooks that use the generic hook and wrap it with more specific APIs.