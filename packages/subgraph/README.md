# GeoGenesis Subgraph

The GeoGenesis subgraph is a triple store, derived from an immutable log of commands.

## Schema Design

The unique challenges we face influence our schema design.

- [Naming](#naming)
- [Entity IDs](#entity-ids)
- [Uniqueness](#uniqueness)
- [Cardinality](#cardinality)
- [Batch operations](#batch-operations)
  - [Entity Deletion](#entity-deletion)
  - [Attribute Schemas](#attribute-schemas)
- [Nested queries](#nested-queries)
  - [Merging Interfaces](#merging-interfaces)
  - [Flattening Types](#flattening-types)

### Naming

There are a few naming systems that make sense for a graph database:

- Node/Edge
- Entity/Triple

We've been using entity/triple so far.

Pros of entity/triple:

- Our database most closely matches a triple store implementation
- Compared to node/edge, triple seems more accurate since we have "edges" that point to scalars

Cons of entity/triple:

- "entity" is overloaded, since it means something in subgraphs already
- `Entity` is a reserved type, so we'd need to use `GeoEntity` or similar.
- Compared to node/edge, less familiar to most devs?

### Entity IDs

To be extra safe about collisions, we could combine the author's public key with a random id.

- The public key prevents collisions between (potentially malicious) users
- The random id prevents collisions between a user who may have multiple devices

For example:

```
{publicKey}_{nanoid}
0x0cBccE4664bA7F0cF3B8DbA8f2Ae42180A4913b2_51WrpGSJWKtLuFrEdrt4d
```

We should only use url-safe characters in ids.

**Open Question: Is the public key really necessary?**

If we use enough random bits, it's practically impossible for IDs to collide.

It's valid for a user to modify/delete an existing entity that somebody else created, so malicious users can just as easily attack the system using ids they didn't create.

The main thing the public key helps guard against is poorly implemented clients that might have badly implemented randomness.

### Uniqueness

There are two properties we want, which are difficult to have at the same time:

- We don't want to allow adding the same triple multiple times
- If we're referencing an entity, we don't want that entity's ID to change

Potential solutions:

1. **Tuple id is `{entityId}_{attributeId}_{value}`**: If the "value" is a scalar, the tuple id would change if the scalar changes. This could be fine _if_ we don't need to reference other tuples by id.

2. **Tuple id is random**: Uniqueness wouldn't be enforceable.

3. **Hybrid**: We could instead generate some random id for the "value" portion if it's a scalar. So we'd enforce uniqueness of "edges" between nodes, but not of scalar "properties". _Is that useful for anything?_

### Cardinality

Some attributes can be applied to entities multiple times. E.g. we might want to apply the "web3" and "open source" tags to a single article.

Do we represent this as multiple triples? Or an array of values? Do we support both?

#### As multiple triples

```js
// Tag entities
{entity: 1, attribute: "name", value: "web3"}
{entity: 2, attribute: "name", value: "open source"}

// Article entity
{entity: 3, attribute: "name", value: "my article"}
{entity: 3, attribute: "tag", value: 1}
{entity: 3, attribute: "tag", value: 2}
```

This approach is simple conceptually and in terms of implemention, but makes ordering tricky to implement, since there's no inherent order.

#### As array of values

```js
// Tag entities
{entity: 1, attribute: "name", value: "web3"}
{entity: 2, attribute: "name", value: "open source"}

// Article entity
{entity: 3, attribute: "name", value: "my article"}
{entity: 3, attribute: "tag", value: [1, 2]}
```

Subgraphs don't support ordered arrays of entities, so we would likely store an array of strings. In this model we lose the ability to query within.

Some hybrid of both approaches?

### Core schema types

What is an entity/attribute? Are attributes just entities, or are they a separate type?

Current thinking: attributes _are_ entities, since this allows more meta edges in the graph.

### Batch Operations

In a traditional database, it's possible to operate on large quantities of rows at once. E.g.

- Batch delete: `DELETE FROM people WHERE name="devin"`
- Change table column type: `ALTER TABLE people ALTER COLUMN createdAt int`

Subgraphs mappings only support operating on a single row at a time, and don't support querying for other rows within the mapping itself. Additionally, any transaction that would operate on thousands or more rows is probably unrealistically expensive for graph nodes to perform.

#### Entity Deletion

Suppose a user wants to delete the entity (node) with id `entity-abc`. In terms of the knowledge graph, this should likely delete triples (edges) that have `value: entity-abc`.

Potential solutions:

1. No deletions allowed
2. "Holes" in triples (`value: null`) (possible, but requires `Triple.entity` to be nullable)
3. Soft deletion (`isDeleted`)
4. Deleted entities table (`GeoDeletedEntity`)

Solutions typically involve offloading the work to the client, e.g. filtering for only non-deleted values: `entities(where: {value: {isDeleted: false}})`.

Note that deleting triples is easy if we don't allow referencing other triples and don't delete entities that have no triples about them.

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
