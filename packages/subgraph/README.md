# GeoGenesis Subgraph

The GeoGenesis subgraph is a triple store, derived from an immutable log of commands.

## Challenges

The unique challenges we face influence our schema design.

- [Batch operations](#batch-operations)
- [Nested queries](#nested-queries)

### Batch Operations

In a traditional database, it's possible to operate on large quantities of rows at once. E.g.

- Batch delete: `DELETE FROM people WHERE name="devin"`
- Change table column type: `ALTER TABLE people ALTER COLUMN createdAt int`

Subgraphs mappings only support operating on a single row at a time, and don't support querying for other rows within the mapping itself. Additionally, any transaction that would operate on thousands or more rows is probably unrealistically expensive for graph nodes to perform.

#### Entity Deletion

Suppose a user wants to delete the entity (node) with id `entity-abc`. In terms of the knowledge graph, this should likely delete triples (edges) that have `value: entity-abc`.

Potential solutions:

1. No deletions allowed
2. "Holes" in triples (`value: null`) (presumably possible?)
3. Soft deletion (`isDeleted`)
4. Deleted entities table (`GeoDeletedEntity`)

Solutions typically involve offloading the work to the client, e.g. filtering for only non-deleted values: `entities(where: {value: {isDeleted: false}})`.

#### Attribute Schemas

Suppose a user wants to add an attribute `name`, where names must be of type `string`. Or more advanced, an attribute `contributors`, with cardinality N where each contributor must be an entity with the attribute `type=person`.

We could enforce these kinds of rules when adding new triples. However, if a user wants to _change_ a schema, we run into the batching problem.

Potential solutions:

1. No schemas
2. No changing schemas
3. Soft schema changes

### Nested Queries

Graph node has limited support for nested/complex queries. Child queries are possible, but only 1-level deep. This is a time/memory performance constraint that seems unlikely to change. Additionally, nested queries aren't supported on interface (union) types.

For this reason, we flatten/merge the schema as much as possible, optimizing for more expressive queries at the expense of disk space.

E.g. an _intuitive_ way to represent the `value` of a triple might be:

```graphql
type Triple @entity {
  id: ID!
  value: Value
  # ...
}

interface Value {
  id: ID!
}

type NumberValue implements Value @entity {
  id: ID!
  numberValue: BigDecimal
}

type StringValue implements Value @entity {
  id: ID!
  stringValue: String
}

type EntityValue implements Value @entity {
  id: ID!
  entityValue: GeoEntity
}
```

However, this would not support filtering over children of interface types: `triples(where: {value: {stringValue: "devin"}}) {}`.

#### Merging interfaces

We can support child filtering by merging all interface implementations into a single type:

```graphql
type Triple @entity {
  id: ID!
  value: Value
  # ...
}

interface Value @entity {
  id: ID!
  valueType: ValueType!
  numberValue: BigDecimal
  stringValue: String
  entityValue: GeoEntity
}

enum ValueType {
  NUMBER
  STRING
  ENTITY
}
```

This would enable child filtering like `triples(where: {value: {stringValue: "devin"}}) {}`.

However, since we're already using our 1 nesting level to look into a `value`, we wouldn't be able to go deeper. 2 levels of nesting isn't allowed, as in `triples(where: {value: { entityValue: { ... }} }}}) {}`.

#### Flattening types

If we want to get another level of expressiveness, we can further flatten to:

```graphql
type Triple @entity {
  id: ID!
  valueType: ValueType!
  numberValue: BigDecimal
  stringValue: String
  entityValue: GeoEntity
  # ...
}

enum ValueType {
  NUMBER
  STRING
  ENTITY
}
```

This level of expressiveness may not be needed initially, but is likely worth allowing from the start since we've previously needed advanced queries like this. E.g. the `GeoEntity` type may have more fields we want to filter by in the future.
