# Triples

Triples are the most primitive data structure used in Geo.

Triples are a concept traditionally used in graph databases or knowledge graph data stores. They're useful to arbitrarily define any data about any concept, and especially for querying data based on semantic meaning. Since data in Geo uses the Triples format, we don't have to define a schema ahead of time in our database. Instead Triples create the data model for entities in user-land.

In Geo a Triple is a data structure comprised of three elements (thus "Triple): an [Entity](01-entities.md) ID, an [Attribute](03-attributes.md) ID, and a [Value](04-values.md) ID. A set of Triples define the information for any given Entity (Entity) based on the Entity ID that each Triple references.

[](./images/triples.png)

### Implementation

In the Geo data service we map the concept of a Triple to a relational database using PostgreSQL. We store a large table of triples (https://github.com/geobrowser/geogenesis/blob/bf51df1309f412de957942e0405400163f92878e/packages/substream/src/sql/initPublic.sql#L112). Each Triple in Postgres references an Entity ID, Attribute ID, and Value ID. We also store some additional metadata to make querying things like the raw Value of the triple easier. There's also additional metadata around Entity versioning (See Versioning).

Here's a link to the Triples schema in the Geo substream (https://github.com/geobrowser/geogenesis/blob/bf51df1309f412de957942e0405400163f92878e/packages/substream/src/sql/initPublic.sql#L112).
