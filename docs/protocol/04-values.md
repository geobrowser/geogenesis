# Value

A Value in Geo is the part of a [Triple](02-triples.md) that stores the actual primitive contents of a Triple. Right now Geo supports many Value types such as `Text`, `Image`, `Number`, `Date`, and `Relation`. Most value types in Geo are primitives, with the exception of `Relation` value types which are references to other Entities.

For example, a Triple that defines the name of an entity will likely have a value type of `Text`, and the Value within the Triple would contain the entity's name.
