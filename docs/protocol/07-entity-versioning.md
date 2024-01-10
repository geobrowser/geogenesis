# Entity versioning

[Entities](01-entities.md) in Geo are versioned based on when they have changed over time. Users group changes to a set of [Triples](02-triples.md) (and thus changes to an Entity) into a Proposal. Changes to an Entity result in a new Version of each changed [Entity](01-entities.md). Versioning Entities allows us to inspect how the data has changed over time and run comparisons, do reverts and rebases, etc.

Each Version stores the entire state of the [Entity](01-entities.md)'s triples at the time the Version was created. This means we store _all_ triples that have ever been created, and associate each Triple with a specific [Entity](01-entities.md) version. An [Entity](01-entities.md) might have many versions, and an individual [Triple](02-triples.md) might belong to many versions.

Since the data model for publishing data in Geo is operation-based, the Versioning model essentially works like a combination of an operations-based CRDT and a state-based CRDT at the [Entity](01-entities.md) level.

[](./images/versioning.png)

### Implementation

In the Geo data service we map the concept of a Triple to a relational database using PostgreSQL. We store a large table of triples (https://github.com/geobrowser/geogenesis/blob/bf51df1309f412de957942e0405400163f92878e/packages/substream/src/sql/initPublic.sql#L112).

Since we store _all_ triples over time, each triple has an `isStale` flag to denote if it exists as part of the most recent entity version. We associate each triple to one or many versions using a `TripleVersions` join table. You can see the schema definition [here](https://github.com/geobrowser/geogenesis/blob/bf51df1309f412de957942e0405400163f92878e/packages/substream/src/sql/initPublic.sql#L168).
