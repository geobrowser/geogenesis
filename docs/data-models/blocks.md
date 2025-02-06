# Blocks

A `Block` is a data model in The Graph used to render rich content for an entity. Blocks themselves are entities. Geo Genesis currently supports editing and rendering a few types of Blocks:

1. Text Block
2. Image Block
3. Data Block

## Text Block

Text blocks are entities which store text content for rendering rich text content for an entity.

#### Fields

`Types`
A Text Block has a Types relation pointing to the the id `Fc836HBAyTaLaZgBzcTS2a`. This id is used to uniquely identity an entity as a Text Block.

`Markdown content`

The text content of a Text Block is represented as [CommonMark markdown](https://commonmark.org/). This is stored as a `TEXT` triple with an attribute id of `V9A2298ZHL135zFRH4qcRg`.

## Image Block

Image blocks are entities which store an image resource identifier. Note that any Image in The Knowledge graph can be represented as an Entity. There's no functional difference between an Image _Block_ and an Image _Entity_ other than how they're semantically consumed. They store the same data.

#### Fields

`Types`
An Image Block has a Types relation pointing to the the id `Q1LaZhnzj8AtCzx8T1HRMf`. This id is used to uniquely identity an entity as an Image.

`Image URL`

The image data in an Image Block is usually stored on IPFS. The resource identifier is prefixed with `ipfs://` to denote that the resource is located on IPFS. The URI for the image data is stored as a `URL` triple with an attribute id of `J6cw1v8xUHCFsEdPeuB1Uo`.

## Data Block

Data Blocks are entities which store metadata about dynamic lists in The Graph. Data Blocks can be used to represent data that's been dynamically queried or manually set by individuals.

### Queries

Data Blocks can represent a query made within The Graph. Data Blocks store a Filter which specifies how a query should be made and what filters should be applied to the query. Clients should decode this filter and map it to the appropriate query language for their application.

@TODO Read more about the Filter specification here

### Collections

Data Blocks can represent manually created lists of entities within The Graph. This differs from a query in that the data for a Collection is stored on the Data Block itself, whereas Queries require fetching data dynamically.
