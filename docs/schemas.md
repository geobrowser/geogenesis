# Schemas

Schemas in Geo are groups of related entities and triples that conform to an expected shape. Right now schemas are not _validated_, but the Geo subgraph and client will expect certain schemas for certain types of data.
<br>

### Types

Types in Geo define what an entity _is_. For example, Microsoft _is a company_. Entities also can have one or more type. Bill gates can be a Person and a Philanthropist. Types in Geo are entities. This means they can have arbitrary triples assigned to them like other entities.

Types can also have specific **attributes** which define the **schema** for a Type. For example, a Person type's schema may require that a Person have a Date of Birth.

| Attribute     | Value            |
| ------------- | ---------------- |
| Types         | Person           |
| Name          | Bill Gates       |
| Date of Birth | October 28, 1955 |
| Date of Death |                  |

These required attributes are defined on the type itself using the **Attributes** attribute.

| Attribute  | Value                                                                                             |
| ---------- | ------------------------------------------------------------------------------------------------- |
| Types      | Type (the type of this entity is Type, indicating that this entity describes what something _is_) |
| Name       | Person                                                                                            |
| Attributes | Date of Birth, Date of Death (a Type entity can have multiple attributes as part of its schema)   |

<br>

### Attribute Value Types

As part of the schema, each Attribute can define what **Value Type** it should have. For example, the Date of Birth Attribute may require that the Value Type is a Date. An Employer attribute on Person may require that the Value Type is a Relation.

| Attribute  | Value                                                       |
| ---------- | ----------------------------------------------------------- |
| Types      | Attribute (this indicates that this entity is an Attribute) |
| Name       | Date of Birth                                               |
| Value Type | Date                                                        |

### Schema validation

Right now we do not validate entities of a Type correctly conform to the Type's schema. It is something we will likely do eventually.
<br>

### Using schemas to define data models

Entities and their schemas encode the shape of data for entities everywhere in Geo, and will continue to be important as we introduce new types of Data in Geo, such as Pages, Blocks, Profiles, and more.

For example, a Profile might have a schema like this:

| Attribute  | Value                            |
| ---------- | -------------------------------- |
| Types      | Type                             |
| Name       | Profile                          |
| Attributes | Name, Avatar Url, Wallet Address |

| Attribute  | Value      |
| ---------- | ---------- |
| Types      | Attribute  |
| Name       | Avatar Url |
| Value Type | String     |

| Attribute  | Value          |
| ---------- | -------------- |
| Types      | Attribute      |
| Name       | Wallet Address |
| Value Type | String         |
