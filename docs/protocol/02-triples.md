# Triples

Triples are the most primitive data structure used in Geo.

Triples are a concept traditionally used in graph databases or knowledge graph data stores. They're useful to arbitrarily define any data about any concept, and especially for querying data based on semantic meaning. Since data in Geo uses the Triples format, we don't have to define a schema ahead of time in our database. Instead Triples create the data model for entities in user-land.

In Geo a Triple is a data structure comprised of three elements (thus "Triple): an [Entity](01-entities.md) ID, an [Attribute](03-attributes.md) ID, and a [Value](04-values.md) ID. A set of Triples define the information for any given [Entity](01-entities.md) based on the Entity ID that each Triple references.

![Image depicting how a triple is composed of three identifiers](images/triples.png)

In the Geo data service we map the concept of a Triple to a relational database using PostgreSQL. We store a large table of triples that each reference an [Entity ID](https://github.com/geobrowser/geogenesis/blob/bf51df1309f412de957942e0405400163f92878e/packages/substream/src/sql/initPublic.sql#L112).

Each Triple in Postgres references an Entity ID, Attribute ID, and Value ID. We also store some additional metadata to make querying things like the raw Value of the triple easier. There's also additional metadata around Entity versioning (See [Versioning](07-entity-versioning.md)). Below is an example of Triples data coming from Geo.

![Image depicting triples data coming from the Geo backend](images/triples-data.png)

[Here's a link to the Triples schema in the Geo substream](https://github.com/geobrowser/geogenesis/blob/bf51df1309f412de957942e0405400163f92878e/packages/substream/src/sql/initPublic.sql#L112).

![Diagram depicting the Geo data model](images/data-model.png)

### Triples and Spaces

Additionally, triples are organized and scoped into [Spaces](06-spaces.md).

A Triple is uniquely identifiable by it's ID, which is an aggregate of the triple's [Entity](01-entities.md) ID, [Attribute](03-attributes.md) ID, [Value](04-values.md) ID, and the [Space](06-spaces.md) ID where the Triple is published.

Triples can reference entities from _any_ Space, not just the Space that the Triple is defined in.
