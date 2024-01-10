# Space

A Space in Geo corresponds to a "bucket" of information that has some level of governance associated with it. Spaces each have their own governance models, some might have voting on content changes, some might not, but each space detemines _who_ is allowed to make content changes or not.

Triples are also scoped to a space. Having triples scoped to specific spaces enables us to apply governance and social coordination over a specific set of data.

You may have many triples across many spaces that all reference the same Entity ID. This enables the Geo knowledge graph to have different representations of the same entity depending on the context of different spaces.

### Implementation

A Space is a smart contract deployed to the Polygon blockchain. Each smart contract has an append-only log tracking the set of IPFS CIDs published within the Space. Additionally, the smart contract controls permissions and governance behaviors.

A [Triple](./02-triples.md) is uniquely identifiable by it's ID, which is an aggregate of the triple's [Entity](01-entities.md) ID, [Attribute](03-attributes.md) ID, [Value](04-values.md) ID, and the Space ID where the Triple is published.

You can see the current implementation of the Geo Space contract [here](https://github.com/geobrowser/geogenesis/blob/master/packages/contracts/contracts/Space.sol).

We are currently rewriting our smart contracts to support a new governance and permissions model.
