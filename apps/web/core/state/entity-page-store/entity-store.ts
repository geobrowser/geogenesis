import { SYSTEM_IDS } from '@geogenesis/ids';
import { Observable, ObservableComputed, batch, computed, observable, observe } from '@legendapp/state';
import { A, pipe } from '@mobily/ts-belt';
import { Editor, JSONContent, generateHTML, generateJSON } from '@tiptap/core';
import pluralize from 'pluralize';
import showdown from 'showdown';

import { TableBlockSdk } from '~/core/blocks-sdk';
import { Environment } from '~/core/environment';
import { ID } from '~/core/id';
import { Subgraph } from '~/core/io';
import { EntityValue, Triple as ITriple } from '~/core/types';
import { Action } from '~/core/utils/action';
import { Entity } from '~/core/utils/entity';
import { Triple } from '~/core/utils/triple';
import { getImagePath } from '~/core/utils/utils';
import { Value } from '~/core/utils/value';
import { ValueTypeId } from '~/core/value-types';

import { tiptapExtensions } from '~/partials/editor/editor';
import { htmlToPlainText } from '~/partials/editor/editor-utils';

import { ActionsStore } from '../actions-store';
import { LocalStore } from '../local-store';

const markdownConverter = new showdown.Converter();

interface IEntityStore {
  create(triple: ITriple): void;
  update(triple: ITriple, oldTriple: ITriple): void;
  remove(triple: ITriple): void;
}

export const createInitialDefaultTriples = (spaceId: string, entityId: string): ITriple[] => {
  const nameTriple = Triple.withId({
    space: spaceId,
    entityId,
    entityName: '',
    attributeName: 'Name',
    attributeId: SYSTEM_IDS.NAME,
    placeholder: true,
    value: {
      id: '',
      type: 'string',
      value: '',
    },
  });

  const descriptionTriple = Triple.withId({
    space: spaceId,
    entityId,
    entityName: '',
    attributeName: 'Description',
    attributeId: SYSTEM_IDS.DESCRIPTION,
    placeholder: true,
    value: {
      id: '',
      type: 'string',
      value: '',
    },
  });

  const typeTriple = Triple.withId({
    space: spaceId,
    entityId,
    entityName: '',
    attributeName: 'Types',
    attributeId: SYSTEM_IDS.TYPES,
    placeholder: true,
    value: {
      id: '',
      type: 'entity',
      name: '',
    },
  });

  return [nameTriple, descriptionTriple, typeTriple];
};

const DEFAULT_PAGE_SIZE = 100;

interface IEntityStoreConfig {
  subgraph: Subgraph.ISubgraph;
  config: Environment.AppConfig;
  spaceId: string;
  id: string;
  initialTriples: ITriple[];
  initialSchemaTriples: ITriple[];
  initialBlockIdsTriple: ITriple | null;
  initialBlockTriples: ITriple[];
  ActionsStore: ActionsStore;
  LocalStore: LocalStore;
}

export class EntityStore implements IEntityStore {
  private LocalStore: LocalStore;
  private subgraph: Subgraph.ISubgraph;
  private config: Environment.AppConfig;
  id: string;
  spaceId: string;
  triples$: ObservableComputed<ITriple[]>;
  blockIds$: ObservableComputed<string[]>;
  collectionEntities$: ObservableComputed<{ entityId: string; blockId: string }[]>;
  blockIdsTriple$: ObservableComputed<ITriple | null>;
  blockTriples$: ObservableComputed<ITriple[]>;
  editorJson$: ObservableComputed<JSONContent>;
  typeTriples$: ObservableComputed<ITriple[]>;
  schemaTriples$: Observable<ITriple[]> = observable<ITriple[]>([]);
  hiddenSchemaIds$: Observable<string[]> = observable<string[]>([]);
  ActionsStore: ActionsStore;
  abortController: AbortController = new AbortController();
  name$: ObservableComputed<string>;

  constructor({
    initialTriples,
    initialBlockIdsTriple,
    initialBlockTriples,
    initialSchemaTriples,
    spaceId,
    id,
    ActionsStore,
    LocalStore,
    subgraph,
    config,
  }: IEntityStoreConfig) {
    const defaultTriples = createInitialDefaultTriples(spaceId, id);

    this.subgraph = subgraph;
    this.config = config;
    this.id = id;
    this.schemaTriples$ = observable([...initialSchemaTriples, ...defaultTriples]);
    this.spaceId = spaceId;
    this.ActionsStore = ActionsStore;
    this.LocalStore = LocalStore;

    this.triples$ = computed(() => {
      const spaceActions = ActionsStore.actions$.get()[spaceId] ?? [];

      return pipe(
        spaceActions,
        actions => Action.squashChanges(actions),
        actions => Triple.fromActions(actions, initialTriples),
        A.filter(t => t.entityId === id),
        triples =>
          // We may be referencing attributes/entities from other spaces whose name has changed.
          // We pass _all_ local changes instead of just the current space changes.
          Triple.withLocalNames(
            Object.values(ActionsStore.actions$.get()).flatMap(a => a),
            triples
          )
      );
    });

    this.blockIdsTriple$ = computed(() => {
      // We deeply track the specific blockIdsTriple for this entity. This is so the block editor
      // does not re-render when other properties of the entity are changed.
      const entityChanges = ActionsStore.actionsByEntityId$[id];

      // @ts-expect-error legendstate's types do not like accessing a nested computed value in a
      // record by id like this.
      const blocksIdTriple: ITriple | undefined = entityChanges?.[SYSTEM_IDS.BLOCKS]?.get();

      // Favor the local version of the blockIdsTriple if it exists
      return blocksIdTriple ?? initialBlockIdsTriple ?? null;
    });

    this.collectionEntities$ = computed(() => {
      const blockIdsTriple = this.blockIdsTriple$.get();
      const collectionId = blockIdsTriple?.value.type === 'collection' ? blockIdsTriple.value.id : null;
      const spaceActions = ActionsStore.actions$.get()[spaceId] ?? [];

      // Check for entities that have a backlink to the block collection.
      const collectionEntities = pipe(
        spaceActions,
        actions => Action.squashChanges(actions),
        // @TODO: pass initial collection triples
        actions => Triple.fromActions(actions, []),
        A.filter(
          t =>
            t.attributeId === SYSTEM_IDS.COLLECTION_BACKLINK && t.value.type === 'entity' && t.value.id === collectionId
        ),
        A.map(t => t.entityId)
      );

      // Get the block ids for each collection entity
      const blockIds = pipe(
        spaceActions,
        actions => Action.squashChanges(actions),
        // @TODO: Pass initial collection triples
        actions => Triple.fromActions(actions, []),
        A.filter(
          t =>
            t.attributeId === SYSTEM_IDS.COLLECTION_ITEM_REFERENCE &&
            t.value.type === 'entity' &&
            collectionEntities.includes(t.value.id)
        ),
        A.map(t => t.entityId)
      );

      // Create a join table of collection entities and the pointer to their block ids
      return [];
    });

    this.blockIds$ = computed(() => {
      // @TODO
      // 1. Fetch collection items
      // 2. Fetch blocks from collection items
      return this.collectionEntities$.get().map(({ blockId }) => blockId);
    });

    this.name$ = computed(() => {
      return Entity.name(this.triples$.get()) || '';
    });

    this.blockTriples$ = computed(() => {
      const spaceActions = ActionsStore.actions$.get()[spaceId] ?? [];
      const blockIds = this.blockIds$.get();

      return pipe(
        spaceActions,
        actions => Triple.fromActions(actions, initialBlockTriples),
        A.filter(t => blockIds.includes(t.entityId)),
        triples =>
          // We may be referencing attributes/entities from other spaces whose name has changed.
          // We pass _all_ local changes instead of just the current space changes.
          Triple.withLocalNames(
            Object.values(ActionsStore.actions$.get()).flatMap(a => a),
            triples
          )
      );
    });

    /* Transforms our block triples back into a TipTap-friendly JSON format */
    this.editorJson$ = computed(() => {
      const blockIds = this.blockIds$.get();
      const blockTriples = this.blockTriples$.get();

      const json = {
        type: 'doc',
        content: blockIds.map(blockId => {
          const markdownTriple = blockTriples.find(
            triple => triple.entityId === blockId && triple.attributeId === SYSTEM_IDS.MARKDOWN_CONTENT
          );
          const rowTypeTriple = blockTriples.find(
            triple => triple.entityId === blockId && triple.attributeId === SYSTEM_IDS.ROW_TYPE
          );
          const imageTriple = blockTriples.find(
            triple => triple.entityId === blockId && triple.attributeId === SYSTEM_IDS.IMAGE_ATTRIBUTE
          );

          if (imageTriple) {
            return {
              type: 'image',
              attrs: {
                spaceId: this.spaceId,
                id: blockId,
                src: getImagePath(Triple.getValue(imageTriple) ?? ''),
                alt: '',
                title: '',
              },
            };
          }

          if (rowTypeTriple) {
            return {
              type: 'tableNode',
              attrs: {
                spaceId: this.spaceId,
                id: blockId,
                typeId: rowTypeTriple.value.id,
                typeName: Value.nameOfEntityValue(rowTypeTriple),
              },
            };
          }

          const html = markdownTriple ? markdownConverter.makeHtml(Value.stringValue(markdownTriple) || '') : '';
          /* SSR on custom react nodes doesn't seem to work out of the box at the moment */
          const isSSR = typeof window === 'undefined';
          const json = isSSR ? { content: '' } : generateJSON(html, tiptapExtensions);
          const nodeData = json.content[0];

          return {
            ...nodeData,
            attrs: {
              ...nodeData?.attrs,
              id: blockId,
            },
          };
        }),
      };

      if (json.content.length === 0) {
        json.content.push({
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: '',
            },
          ],
        });
      }

      return json;
    });

    /*
    In the edit-events reducer, deleting the last entity of a triple will create a mock entity with no value to
    persist the Attribute field. Filtering out those entities here.
    */
    this.typeTriples$ = computed(() => {
      return this.triples$.get().filter(triple => triple.attributeId === SYSTEM_IDS.TYPES && triple.value.id !== '');
    });

    /*
    Computed values in @legendapp/state will rerun for every change recursively up the tree.
    This is problematic when the computed value is expensive to compute or involves a network request.
    To avoid this, we can use the observe function to only run the computation when the direct dependencies change.
    */
    observe<ITriple[]>(e => {
      const typeTriples = this.typeTriples$.get();
      const previous = e.previous || [];

      // @TODO: This isn't working
      if (!A.eq(previous, typeTriples, (a, b) => a.value.id === b.value.id)) {
        this.setSchemaTriples(typeTriples);
      }

      return typeTriples;
    });
  }

  setSchemaTriples = async (typeTriples: ITriple[]) => {
    this.abortController.abort();
    this.abortController = new AbortController();

    try {
      if (typeTriples.length === 0) {
        this.schemaTriples$.set([]);
      }

      const attributesOnType = await Promise.all(
        typeTriples.map(triple => {
          return this.subgraph.fetchTriples({
            endpoint: this.config.subgraph,
            query: '',
            first: DEFAULT_PAGE_SIZE,
            signal: this.abortController.signal,
            skip: 0,
            filter: [
              {
                field: 'entity-id',
                value: triple.value.id,
              },
              {
                field: 'attribute-id',
                value: SYSTEM_IDS.ATTRIBUTES,
              },
            ],
          });
        })
      );

      const attributeTriples = attributesOnType.flatMap(triples => triples);

      const valueTypesForAttributes = await Promise.all(
        attributeTriples.map(attribute => {
          return this.subgraph.fetchTriples({
            endpoint: this.config.subgraph,
            query: '',
            first: DEFAULT_PAGE_SIZE,
            skip: 0,
            signal: this.abortController.signal,
            filter: [
              {
                field: 'entity-id',
                value: attribute.value.id,
              },
              {
                field: 'attribute-id',
                value: SYSTEM_IDS.VALUE_TYPE,
              },
            ],
          });
        })
      );

      const valueTypeTriples = valueTypesForAttributes.flatMap(triples => triples);

      const valueTypesToAttributesMap = attributeTriples.reduce<Record<string, ValueTypeId | undefined>>(
        (acc, attribute) => {
          acc[attribute.value.id] = valueTypeTriples.find(t => t.entityId === attribute.value.id)?.value
            .id as ValueTypeId;
          return acc;
        },
        {}
      );

      const schemaTriples = attributeTriples.map(attribute => {
        const valueType = valueTypesToAttributesMap[attribute.value.id];

        return {
          ...Triple.emptyPlaceholder(this.spaceId, this.id, valueType),
          attributeId: attribute.value.id,
          attributeName: Value.nameOfEntityValue(attribute),
        };
      });

      this.schemaTriples$.set(schemaTriples);
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') {
        return;
      }

      this.schemaTriples$.set([]);
    }
  };

  hideSchema = (id: string) => {
    const hiddenSchemaIds = this.hiddenSchemaIds$.get();
    if (!hiddenSchemaIds.includes(id)) {
      this.hiddenSchemaIds$.set([...hiddenSchemaIds, id]);
    }
  };

  create = (triple: ITriple) => this.ActionsStore.create(triple);
  remove = (triple: ITriple) => this.ActionsStore.remove(triple);
  update = (triple: ITriple, oldTriple: ITriple) => this.ActionsStore.update(triple, oldTriple);

  getBlockTriple = ({ entityId, attributeId }: { entityId: string; attributeId: string }) => {
    const blockTriples = this.blockTriples$.get();
    return blockTriples.find(t => t.entityId === entityId && t.attributeId === attributeId);
  };

  /* Helper function for transforming a single node of TipTap's JSONContent structure into HTML */
  textNodeHTML = (node: JSONContent) => {
    return generateHTML({ type: 'doc', content: [node] }, tiptapExtensions);
  };

  /* Helper function for getting the human-readable, plain-text name of a node */
  nodeName = (node: JSONContent) => {
    const isTableNode = node.type === 'tableNode';

    if (isTableNode) {
      return `${pluralize(node.attrs?.typeName, 2, false)}`;
    }

    const nodeHTML = this.textNodeHTML(node);
    const nodeNameLength = 20;
    return htmlToPlainText(nodeHTML).slice(0, nodeNameLength);
  };

  /*
  Helper function for creating a new block of type TABLE_BLOCK, TEXT_BLOCK, or IMAGE_BLOCK
  We don't support changing types of blocks, so all we need to do is create a new block with the new type
  */
  createBlockTypeTriple = (node: JSONContent) => {
    const blockEntityId = getNodeId(node);
    const entityName = this.nodeName(node);

    const blockTypeValue: EntityValue = getBlockTypeValue(node.type);

    const existingBlockTriple = this.getBlockTriple({ entityId: blockEntityId, attributeId: SYSTEM_IDS.TYPES });
    const existingCollectionEntityForBlock = this.collectionEntities$.get().find(c => c.blockId === blockEntityId);

    // @TODO: Remove once we have the good shit
    if (!existingBlockTriple) {
      this.create(
        Triple.withId({
          space: this.spaceId,
          entityId: blockEntityId,
          entityName: entityName,
          attributeId: SYSTEM_IDS.TYPES,
          attributeName: 'Types',
          value: blockTypeValue,
        })
      );
    }

    if (!existingCollectionEntityForBlock) {
      const newEntityId = ID.createEntityId();

      this.create(
        Triple.withId({
          space: this.spaceId,
          entityId: newEntityId,
          entityName: `Collection item – ${newEntityId}:${blockEntityId}`,
          attributeId: SYSTEM_IDS.NAME,
          attributeName: 'Name',
          value: { id: ID.createValueId(), type: 'string', value: `Collection item – ${newEntityId}:${blockEntityId}` },
        })
      );

      // Create the reference to block entity
      this.create(
        Triple.withId({
          space: this.spaceId,
          entityId: newEntityId,
          entityName: `Collection item – ${newEntityId}:${blockEntityId}`,
          attributeId: SYSTEM_IDS.COLLECTION_ITEM_REFERENCE,
          attributeName: 'Collection Item Reference',
          value: { id: blockEntityId, type: 'entity', name: entityName },
        })
      );

      // Create the reference to the collection entity
      this.create(
        Triple.withId({
          space: this.spaceId,
          entityId: newEntityId,
          entityName: `Collection item – ${newEntityId}:${blockEntityId}`,
          attributeId: SYSTEM_IDS.COLLECTION_BACKLINK,
          attributeName: 'Collection Backlink',
          value: { id: this.id, type: 'entity', name: this.name$.get() },
        })
      );
    }
  };

  /*
  Helper function for upserting a new block name triple for TABLE_BLOCK, TEXT_BLOCK, or IMAGE_BLOCK
  */
  upsertBlockNameTriple = (node: JSONContent) => {
    const blockEntityId = getNodeId(node);
    const entityName = this.nodeName(node);

    const existingBlockTriple = this.getBlockTriple({ entityId: blockEntityId, attributeId: SYSTEM_IDS.NAME });
    const isUpdated = existingBlockTriple && Value.stringValue(existingBlockTriple) !== entityName;
    const isTableNode = node.type === 'tableNode';

    if (!existingBlockTriple) {
      this.create(
        Triple.withId({
          space: this.spaceId,
          entityId: blockEntityId,
          entityName: entityName,
          attributeId: SYSTEM_IDS.NAME,
          attributeName: 'Name',
          value: { id: ID.createValueId(), type: 'string', value: entityName },
        })
      );
    } else if (!isTableNode && isUpdated) {
      this.update(
        Triple.ensureStableId({
          ...existingBlockTriple,
          entityName,
          value: { ...existingBlockTriple.value, type: 'string', value: entityName },
        }),
        existingBlockTriple
      );
    }
  };

  /* Helper function for upserting a new block markdown content triple for TEXT_BLOCKs only  */
  upsertBlockMarkdownTriple = (node: JSONContent) => {
    const blockEntityId = getNodeId(node);
    const isImageNode = node.type === 'image';
    const isTableNode = node.type === 'tableNode';
    const isList = node.type === 'bulletList';

    if (isImageNode || isTableNode) {
      return null;
    }

    const nodeHTML = this.textNodeHTML(node);

    const entityName = this.nodeName(node);
    let markdown = markdownConverter.makeMarkdown(nodeHTML);

    //  Overrides Showdown's unwanted "consecutive list" behavior found in
    //  `src/subParsers/makeMarkdown/list.js`
    if (isList) {
      markdown = markdown.replaceAll('\n<!-- -->\n', '');
    }

    const triple = Triple.withId({
      space: this.spaceId,
      entityId: blockEntityId,
      entityName: entityName,
      attributeId: SYSTEM_IDS.MARKDOWN_CONTENT,
      attributeName: 'Markdown Content',
      value: { id: ID.createValueId(), type: 'string', value: markdown },
    });

    const existingBlockTriple = this.getBlockTriple(triple);
    const isUpdated = existingBlockTriple && Value.stringValue(existingBlockTriple) !== markdown;

    if (!existingBlockTriple) {
      this.create(
        Triple.withId({
          space: this.spaceId,
          entityId: blockEntityId,
          entityName: entityName,
          attributeId: SYSTEM_IDS.MARKDOWN_CONTENT,
          attributeName: 'Markdown Content',
          value: { id: ID.createValueId(), type: 'string', value: markdown },
        })
      );
    } else if (isUpdated) {
      this.update(
        Triple.ensureStableId({
          ...existingBlockTriple,
          value: { ...existingBlockTriple.value, type: 'string', value: markdown },
        }),
        existingBlockTriple
      );
    }
  };

  /* Helper function for creating backlinks to the parent entity  */
  createParentEntityTriple = (node: JSONContent) => {
    const blockEntityId = getNodeId(node);

    const existingBlockTriple = this.getBlockTriple({ entityId: blockEntityId, attributeId: SYSTEM_IDS.PARENT_ENTITY });

    if (!existingBlockTriple) {
      this.create(
        Triple.withId({
          space: this.spaceId,
          entityId: blockEntityId,
          entityName: this.nodeName(node),
          attributeId: SYSTEM_IDS.PARENT_ENTITY,
          attributeName: 'Parent Entity',
          value: { id: this.id, type: 'entity', name: this.name$.get() },
        })
      );
    }
  };

  /* Helper function for creating a new row type triple for TABLE_BLOCKs only  */
  createTableBlockMetadata = (node: JSONContent) => {
    const blockEntityId = getNodeId(node);
    const isTableNode = node.type === 'tableNode';
    const rowTypeEntityId = node.attrs?.typeId;
    const rowTypeEntityName = node.attrs?.typeName;

    if (!isTableNode) {
      return null;
    }

    const existingRowTypeTriple = this.getBlockTriple({ entityId: blockEntityId, attributeId: SYSTEM_IDS.ROW_TYPE });

    if (!existingRowTypeTriple) {
      this.create(
        Triple.withId({
          space: this.spaceId,
          entityId: blockEntityId,
          entityName: this.nodeName(node),
          attributeId: SYSTEM_IDS.ROW_TYPE,
          attributeName: 'Row Type',
          value: { id: rowTypeEntityId, type: 'entity', name: rowTypeEntityName },
        })
      );

      // Make sure that we only add it for new tables by also checking that the row type triple doesn't exist.
      // Typically the row type triple only gets added when the table is created. Otherwise this will create
      // a new filter for every table block that doesn't have one every time the content of the editor is changed.
      // Generally the filter triple _also_ won't exist if the row type doesn't, but we check to be safe.
      const existingFilterTriple = this.getBlockTriple({ entityId: blockEntityId, attributeId: SYSTEM_IDS.FILTER });

      if (!existingFilterTriple) {
        this.create(
          Triple.withId({
            space: this.spaceId,
            entityId: blockEntityId,
            entityName: this.nodeName(node),
            attributeId: SYSTEM_IDS.FILTER,
            attributeName: 'Filter',
            value: {
              id: ID.createValueId(),
              type: 'string',
              value: TableBlockSdk.createGraphQLStringFromFilters(
                [
                  {
                    columnId: SYSTEM_IDS.SPACE,
                    valueType: 'string',
                    value: this.spaceId,
                  },
                ],
                rowTypeEntityId
              ),
            },
          })
        );
      }
    }
  };

  /* Helper function for creating a new block image triple for IMAGE_BLOCKs only  */
  createBlockImageTriple = (node: JSONContent) => {
    const blockEntityId = getNodeId(node);
    const isImageNode = node.type === 'image';

    if (!isImageNode || !node.attrs?.src) {
      return null;
    }

    const { src } = node.attrs;

    this.create(
      Triple.withId({
        space: this.spaceId,
        entityId: blockEntityId,
        entityName: this.nodeName(node),
        attributeId: SYSTEM_IDS.IMAGE_ATTRIBUTE,
        attributeName: 'Image',
        value: { id: ID.createValueId(), type: 'image', value: Value.toImageValue(src) },
      })
    );
  };

  /*
  Helper function to create or update the block IDs on an entity
  Since we don't currently support array value types, we store all ordered blocks as a single stringified array
  */
  upsertBlocksTriple = async (newBlockIds: string[]) => {
    const existingBlockTriple = this.blockIdsTriple$.get();
    const isUpdated = existingBlockTriple && Value.stringValue(existingBlockTriple) !== JSON.stringify(newBlockIds);

    if (!existingBlockTriple) {
      const newCollectionTypeTriple = Triple.withId({
        attributeId: SYSTEM_IDS.SCHEMA_TYPE,
        attributeName: 'Type',
        entityId: ID.createEntityId(),
        entityName: `Blocks collection – ${this.spaceId}`,
        space: this.spaceId,
        value: {
          type: 'collection',
          id: ID.createValueId(),
        },
      });

      const newCollectionNameTriple = Triple.withId({
        ...newCollectionTypeTriple,
        attributeId: SYSTEM_IDS.NAME,
        attributeName: 'Name',
        value: {
          id: ID.createValueId(),
          type: 'string',
          value: `Collection – ${this.name$.get()}`,
        },
      });

      const blocksTriple = Triple.withId({
        space: this.spaceId,
        entityId: this.id,
        entityName: this.name$.get(),
        attributeId: SYSTEM_IDS.BLOCKS,
        attributeName: 'Blocks',
        value: {
          id: newCollectionTypeTriple.entityId,
          type: 'collection',
        },
      });

      batch(() => {
        this.create(newCollectionTypeTriple);
        this.create(newCollectionNameTriple);
        this.create(blocksTriple);
      });

      return;
    }

    if (!isUpdated) return;

    // If a block is deleted we want to make sure that we delete the block entity as well.
    // The block entity might exist remotely, so we need to fetch all the triple associated
    // with that block entity in order to delete them all.
    //
    // Additionally,there may be local triples associated with the block entity that we need
    // to delete.
    // @TODO: Remove collection item entities
    // @TODO: Remove collection

    const prevBlockIds = this.blockIds$.get();

    // Returns the blockIds that exist in prevBlockIds, but do not exist in newBlockIds
    const removedBlockIds = A.difference(prevBlockIds, newBlockIds);

    // Fetch all the subgraph data for all the deleted block entities.
    const maybeRemoteBlocks = await Promise.all(
      removedBlockIds.map(async blockId => this.subgraph.fetchEntity({ id: blockId, endpoint: this.config.subgraph }))
    );
    const remoteBlocks = maybeRemoteBlocks.flatMap(block => (block ? [block] : []));

    batch(() =>
      // To delete an entity we delete all of its triples
      remoteBlocks.forEach(block => {
        block.triples.forEach(t => this.remove(t));
      })
    );

    // Delete any local triples associated with the deleted block entities
    const localTriplesForDeletedBlocks = pipe(
      this.ActionsStore.allActions$.get(),
      actions => Triple.fromActions(actions, []),
      triples => triples.filter(t => removedBlockIds.includes(t.entityId))
    );

    batch(() => localTriplesForDeletedBlocks.forEach(t => this.remove(t)));

    // We delete the existingBlockTriple if the page content is completely empty
    if (newBlockIds.length === 0) {
      return this.remove(existingBlockTriple);
    }

    const updatedTriple = Triple.ensureStableId({
      ...existingBlockTriple,
      value: {
        ...existingBlockTriple.value,
        type: 'string',
        value: JSON.stringify(newBlockIds),
      },
    });

    return this.update(updatedTriple, existingBlockTriple);
  };

  /* Iterate over the content's of a TipTap editor to create or update triple blocks */
  updateEditorBlocks = (editor: Editor) => {
    const { content = [] } = editor.getJSON();

    const populatedContent = content.filter(node => {
      const isNonParagraph = node.type !== 'paragraph';
      const isParagraphWithContent =
        node.type === 'paragraph' &&
        node.content &&
        node.content.length > 0 &&
        node.content[0].text &&
        !node.content[0].text.startsWith('/'); // Do not create a block if the text node starts with a slash command

      return isNonParagraph || isParagraphWithContent;
    });

    const blockIds = populatedContent.map(node => getNodeId(node));

    batch(() => {
      this.upsertBlocksTriple(blockIds);

      populatedContent.forEach(node => {
        this.createParentEntityTriple(node);
        this.createTableBlockMetadata(node);
        this.createBlockTypeTriple(node);
        this.upsertBlockNameTriple(node);
        this.upsertBlockMarkdownTriple(node);
        this.createBlockImageTriple(node);
      });
    });
  };
}

// Returns the id of the first paragraph even if nested inside of a list
const getNodeId = (node: JSONContent) => node.attrs?.id ?? node?.content?.[0]?.content?.[0]?.attrs?.id;

const getBlockTypeValue = (nodeType?: string): EntityValue => {
  switch (nodeType) {
    case 'paragraph':
      return { id: SYSTEM_IDS.TEXT_BLOCK, type: 'entity', name: 'Text Block' };
    case 'image':
      return { id: SYSTEM_IDS.IMAGE_BLOCK, type: 'entity', name: 'Image Block' };
    case 'tableNode':
      return { id: SYSTEM_IDS.TABLE_BLOCK, type: 'entity', name: 'Table Block' };
    default:
      return { id: SYSTEM_IDS.TEXT_BLOCK, type: 'entity', name: 'Text Block' };
  }
};
