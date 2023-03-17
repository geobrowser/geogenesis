# Pages

Users are able to add block-based content to entities with an editor experience similar to what you'd find in Notion or Craft.

A Page in the Geo knowledge graph is the GeoEntity that the Page describes. i.e., a GeoEntity has a triple that describes the content within the page. Entity pages still have the data-oriented table, but can also add rich Page content. Pages are just entities, so all the normal behaviors of entities apply to Pages.

The graph schema looks something like this:

```
GeoEntity {
  id: "aoisdu12093uralkjds"
  Name: "Apple"
  Page Content: ["idOfFirstBlock", "idOfSecondBlock", "idOfSecondBlock"]

  // Any other triple can be added to a GeoEntity Page.
  Favorite Apple: "Honeycrisp"
}
```

### Page Content

The [Page Content, Value] tuple describes the blocks that appear in a page and the order they appear in. Values in this tuple reference the ids for the Blocks in the page.

Blocks in a Page are entities. This enables a couple of really powerful properties:

- Blocks are independently queryable separately from the page they are created originally from
- Blocks can be inserted in _many_ pages and are independently linkable from the page they are originally created from

When we render a Page, we traverse the Values in the tuple and fetch the actual content of each block.

### Block Schemas

Right now the Geo protocol supports multiple types of Page Blocks.

- Rich Text
- Image
- Entity Table

<br/>

**Rich Text blocks**

A TextBlock contains text content and metadata for how to parse rich text on that text content, like bold, italic, @entity-references, etc. Rich text is stored in Markdown format.

Markdown is a widely adopted format which will allow any number of clients to consume in their own text editors vs. a custom, Geo-specific rich text AST format. It's also more easily extendable if we want to add additional protocol features on top of rich text.

```
This is text content about Bananas
id: "90ausdlkasdland"
Name: This is text content about Bananas
Types: TextBlock
Content: "This is **text** [content](https://bananas.com) about _Bananas_"
```

<br/>

**Image blocks**

An ImageBlock stores an IPFS content hash or http image source url.

```
Banana
id: "23482409284"
Name: "Banana"
Types: ImageBlock
URL: "QmJjadoisjd092urdads"
```

<br/>

**Table blocks**

A TableBlock is an instance of an entity table that references a Type in the knowledge graph. It holds information around the parent type, sort configuration, and column configuration, and any other application-specific configuration.

```
Table about Projects
id: "9034820492"
Name: "Table about Projects"
Row Type: Project // reference to the root Type
Types: TableBlock
Sort order: Ascending
Sort by: Name
```

### Page versioning and block versioning

Since blocks are entities, any other entity (such as entity pages) can reference them. This raises a question around block ownership and versioning. If a block is changed, how are entity versions changed?

If block content is changed, we only update version of the entity page that "owns" the block, usually the entity page that created it.

This means that each block has a backwards reference to the entity that created it. The below schema has a "Parent Entity" attribute to handle the reference between a block and the parent entity.

```
Table about Projects
id: "9034820492"
Name: "Table about Projects"
Parent Entity: "a09sdaksdj"
Row Type: Project // reference to the root Type
Types: TableBlock
Sort order: Ascending
Sort by: Name
```

### Deleting a block

Since blocks are entities, any other entity (such as entity pages) can reference them. This can create cascading reference breaks if the block is deleted.

Blocks are "owned" by a parent entity, so only the parent entity can completely delete a block. We should also cascade update all pages that reference the block that was deleted.

_Note: Right now this is all only enforced by Geo Genesis' UI. There is no mechanism for enforcing this behavior in the protocol itself._

<br/>

### Future features/research

**Inline, internal links within a TextBlock**

A block should be able to link to another entity inline within the text. How do we structure this? How do we query references from within a text block?

We might do an inline protocol in the link that we can parse when parsing the text content: `[Some entity within Geo](geo://idOfReferencedEntity)`

<br/>

**Indexing blocks and searching for blocks**

How should searching for a block entity work? Do we only return the original block? Do we return all _usages_ of the block?

Block indexing should probably live separate from "higher-order" entity indexing so we can separate search into their different domain contexts. We don't want blocks to pollute the results of higher-order entities.

See [Craft](https://craft.do) for examples on how block vs document searches might work.

<br/>

**Block reordering**

We will eventually support drag-n-drop to reorder blocks in a Page.

- How does this affect the page version?
- How does deleting + recreating a block work wrt to versions and links?

<br/>

**Block deletions**

Since blocks are entities and can be referenced by many pages, what happens if someone deletes a Block?
