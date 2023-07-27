## Triple IDs

Triple IDs are currently a combination of space ID, entity ID, attribute ID, and value ID.

All of these IDs are stable UUIDs. For scalar Values (like string or number), the ID is stable. For Value relation IDs (values that point to another entity), the ID is the ID of the entity it points to.

See the README in `/packages/subgraph` for more details.

## Edge-cases for using IDs.

Right now if you change the contents of a triple locally -- e.g., you change the Attribute or the Value of a relation -- we shouldn't update the Triple ID. This is to make it easy to track how triples have changed locally over time for use in change counts, diffing, and squashing local actions before publishing them.

Whenever the triple gets published to the network, the subgraph will generate a new ID for the triple based on its contents, and the local version will overwritten.
