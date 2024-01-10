# Space

A Space in Geo corresponds to a "bucket" of information that has some level of governance associated with it. Spaces each have their own governance models, some might have voting on content changes, some might not, but each space detemines _who_ is allowed to make content changes or not.

A Space is a smart contract that tracks data added to the knowledge graph via an append-only log of IPFS CIDs. The Geo knowledge graph is comprised of many spaces, each tracking their own set of data. [Triples](02-triples.md) in Geo can reference entities from any Space. Additionally, spaces control their own governance and permissions behavior.

You can see the current implementation of the Geo Space contract [here](https://github.com/geobrowser/geogenesis/blob/master/packages/contracts/contracts/Space.sol).

We are currently rewriting our smart contracts to support a new governance and permissions model.

### Triples and Spaces

[Triples](02-triples.md) are also scoped to a space. Having triples scoped to specific spaces enables us to apply governance and social coordination over a specific set of data.

A [Triple](02-triples.md) is uniquely identifiable by it's ID, which is an aggregate of the triple's [Entity](01-entities.md) ID, [Attribute](03-attributes.md) ID, [Value](04-values.md) ID, and the Space ID where the Triple is published.
