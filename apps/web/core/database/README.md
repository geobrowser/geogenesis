The local database is a store that provides a unified interface for querying local changes that has been merged with local data. The database also providers persistence.

This is achieved with two pieces, a "write stream" and a "read stream". The write stream is a series of Ops written locally over time. The read stream derives data from the write stream and merges it with the remote representation of this data.

For example, let's say you update the name of an entity from Geo to Geo Browser. This is represented as an Op in the write stream. The read stream listens for this Op and maps it to the Geo Browser entity based on its entity ID.

The read stream is represented as a normalized entity. Data in the knowledge graph is highly relational, with triples referencing entities which are referenced by relations which reference other entities which reference types, etc. In order to store and read the data efficiently we store an Entity with a normalized representation of these relationships. These normalized entities are stored in a lookup table (Map) for fast lookups.

When a consumer reads an entity, we map the normalized representation to a full representation using the lookup table.

### Open questions

- How do we look up entities that might not exist locally? We should store locally any entity that gets referenced by another entity in the store. This might be slow for a given write since the graph can be large and recursive. We need a logical stopping point to prevent N+1 queries. We should probably look at how we avoid this in our graphql queries.
- Right now we merge local data with data passed from somewhere else. e.g., when merging triples we fetch remote triples then pass that data into the merge module. Should we instead let the database handle fetching the data instead of the consumer of the database?
- How do we optimize reads to not cause unnecessary renders?
- What do we persist in indexeddb? Just the ops? Or also the entities? If we also store the entities then we can avoid having to fetch them again when the user comes back to the app.
