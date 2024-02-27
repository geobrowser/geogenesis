# What is Geo?

Geo is two things: 1) a way for communities to organize and get to consensus on knowledge and information and 2) A user interface for browsing The Graph.

At it's core, the Geo is a worldwide, public, decentralized graph database built with Ethereum, IPFS, and a data service deployed on The Graph Network. Geo enables us to curate the world's public knowledge in a trustless, decentralized, transparent way.

The Geo Genesis dApp is meant to be the best interface for browsing and interacting with public knowledge and information.

### Data model

Knowledge in Geo is organized into an ["Entity"](./01-entities.md), a uniquely identifiable data structure that is referenced by ["Triples"](02-triples.md).

A [Triple](02-triples.md) is a data structure composed of three elements: an [Entity](01-entities.md) identifier, an [Attribute](03-attributes.md) identifier, and a [Value](04-values.md) identifier. Composing these identifier references between entities and triples creates the graph of information in Geo.

Triples are scoped to [Spaces](06-spaces.md). A Space is a smart contract that tracks data added to the knowledge graph via an append-only log of [IPFS](https://ipfs.tech/) [content identifiers](https://docs.ipfs.tech/concepts/content-addressing) (CIDs). The Geo knowledge graph is comprised of many spaces, each tracking their own set of data. Anybody can deploy a Space contract and start their own knowledge graph or reference data in other spaces. Additionally, spaces control their own governance and permissions behavior.

![Diagram depicting the data model between concepts in Geo](images/data-model.png)
