import { SYSTEM_IDS } from '@geogenesis/ids';
import { batch, computed, Observable, observable, ObservableComputed, observe } from '@legendapp/state';
import { A, pipe } from '@mobily/ts-belt';
import { Editor, generateHTML, generateJSON, JSONContent } from '@tiptap/core';
import showdown from 'showdown';
import pluralize from 'pluralize';

import { ActionsStore } from '~/modules/action';
import { tiptapExtensions } from '~/modules/components/editor/editor';
import { htmlToPlainText } from '~/modules/components/editor/editor-utils';
import { ID } from '~/modules/id';
import { MergedData, NetworkData } from '~/modules/io';
import { Triple } from '~/modules/triple';
import { EntityValue, Triple as ITriple } from '~/modules/types';
import { Value } from '~/modules/value';
import { Entity } from '..';

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
  api: NetworkData.INetwork;
  spaceId: string;
  id: string;
  initialTriples: ITriple[];
  initialSchemaTriples: ITriple[];
  initialBlockIdsTriple: ITriple | null;
  initialBlockTriples: ITriple[];
  ActionsStore: ActionsStore;
}

export class EntityStore implements IEntityStore {
  private api: NetworkData.INetwork;
  id: string;
  spaceId: string;
  triples$: ObservableComputed<ITriple[]>;
  blockIds$: ObservableComputed<string[]>;
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
    api,
    initialTriples,
    initialBlockIdsTriple,
    initialBlockTriples,
    initialSchemaTriples,
    spaceId,
    id,
    ActionsStore,
  }: IEntityStoreConfig) {
    const defaultTriples = createInitialDefaultTriples(spaceId, id);

    this.id = id;
    this.api = api;
    this.schemaTriples$ = observable([...initialSchemaTriples, ...defaultTriples]);
    this.spaceId = spaceId;
    this.ActionsStore = ActionsStore;
    this.blockIdsTriple$ = computed(() => {
      const localBlockIdsForEntity = Triple.fromActions(ActionsStore.actions$.get()[spaceId], [])
        .filter(t => t.entityId === id)
        .find(t => t.attributeId === SYSTEM_IDS.BLOCKS);

      // Favor the local version of the blockIdsTriple if it exists
      return localBlockIdsForEntity ?? initialBlockIdsTriple;
    });

    this.blockIds$ = computed(() => {
      const blockIdsTriple = this.blockIdsTriple$.get();

      return blockIdsTriple ? (JSON.parse(Value.stringValue(blockIdsTriple) || '[]') as string[]) : [];
    });

    this.triples$ = computed(() => {
      const spaceActions = ActionsStore.actions$.get()[spaceId] ?? [];

      return pipe(
        spaceActions,
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
                src: Triple.getValue(imageTriple),
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

    const attributeRelationTypes = computed(async () => {
      const triples = this.triples$.get();
      const schemaTriples = this.schemaTriples$.get();

      const attributesWithRelationValues = [...triples, ...schemaTriples]
        .filter(t => t.value.type === 'entity')
        .map(t => ({ attributeId: t.attributeId, attributeName: t.attributeName }));

      // @TODO: Fetch the relation types from the server/local state
      const mergedStore = new MergedData({ api: this.api, store: this.ActionsStore });
      const relationAttributeTypes = await Promise.all(
        attributesWithRelationValues.map(a =>
          mergedStore.fetchTriples({
            query: '',
            first: DEFAULT_PAGE_SIZE,
            skip: 0,
            filter: [
              {
                field: 'entity-id',
                value: a.attributeId,
              },
              {
                field: 'attribute-id',
                value: SYSTEM_IDS.RELATION_VALUE_RELATIONSHIP_TYPE,
              },
            ],
          })
        )
      );
    });

    /*
    Computed values in @legendapp/state will rerun for every change recursively up the tree.
    This is problematic when the computed value is expensive to compute or involves a network request.
    To avoid this, we can use the observe function to only run the computation when the direct dependencies change.
    */
    observe<ITriple[]>(e => {
      const typeTriples = this.typeTriples$.get();
      const previous = e.previous || [];

      // TODO: This isn't working
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

      const attributes = await Promise.all(
        typeTriples.map(triple => {
          return this.api.fetchTriples({
            query: '',
            first: DEFAULT_PAGE_SIZE,
            abortController: this.abortController,
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

      const attributeTriples = attributes.flatMap(attribute => attribute.triples);

      const valueTypes = await Promise.all(
        attributeTriples.map(attribute => {
          return this.api.fetchTriples({
            query: '',
            first: DEFAULT_PAGE_SIZE,
            skip: 0,
            abortController: this.abortController,
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

      const valueTypeTriples = valueTypes.flatMap(valueType => valueType.triples);

      const schemaTriples = attributeTriples.map((attribute, index) => {
        const valueType = valueTypeTriples[index]?.value.id;

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
    const blockEntityId = node.attrs?.id;
    const entityName = this.nodeName(node);

    const blockTypeValue: EntityValue = getBlockTypeValue(node.type);

    const existingBlockTriple = this.getBlockTriple({ entityId: blockEntityId, attributeId: SYSTEM_IDS.TYPES });

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
  };

  /*
  Helper function for upserting a new block name triple for TABLE_BLOCK, TEXT_BLOCK, or IMAGE_BLOCK
  */
  upsertBlockNameTriple = (node: JSONContent) => {
    const blockEntityId = node.attrs?.id;
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
    const blockEntityId = node.attrs?.id;
    const isImageNode = node.type === 'image';
    const isTableNode = node.type === 'tableNode';

    if (isImageNode || isTableNode) {
      return null;
    }

    const nodeHTML = this.textNodeHTML(node);

    const entityName = this.nodeName(node);
    const markdown = markdownConverter.makeMarkdown(nodeHTML);

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
    const blockEntityId = node.attrs?.id;

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
  createBlockRowTypeTriple = (node: JSONContent) => {
    const blockEntityId = node.attrs?.id;
    const isTableNode = node.type === 'tableNode';
    const rowTypeEntityId = node.attrs?.typeId;
    const rowTypeEntityName = node.attrs?.typeName;

    if (!isTableNode) {
      return null;
    }

    const existingBlockTriple = this.getBlockTriple({ entityId: blockEntityId, attributeId: SYSTEM_IDS.ROW_TYPE });

    if (!existingBlockTriple) {
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
    }
  };

  /* Helper function for creating a new block image triple for IMAGE_BLOCKs only  */
  createBlockImageTriple = (node: JSONContent) => {
    const blockEntityId = node.attrs?.id;
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
        value: { id: ID.createValueId(), type: 'image', value: src },
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
      const triple = Triple.withId({
        space: this.spaceId,
        entityId: this.id,
        entityName: this.name$.get(),
        attributeId: SYSTEM_IDS.BLOCKS,
        attributeName: 'Blocks',
        value: {
          id: ID.createValueId(),
          type: 'string',
          value: JSON.stringify(newBlockIds),
        },
      });

      return this.create(triple);
    }

    if (!isUpdated) return;

    // If a block is deleted we want to make sure that we delete the block entity as well.
    // The block entity might exist remotely, so we need to fetch all the triple associated
    // with that block entity in order to delete them all.
    //
    // Additionally,there may be local triples associated with the block entity that we need
    // to delete.
    const prevBlockIds = this.blockIds$.get();

    // Returns the blockIds that exist in prevBlockIds, but do not exist in newBlockIds
    const removedBlockIds = A.difference(prevBlockIds, newBlockIds);

    // Fetch all the subgraph data for all the deleted block entities.
    const maybeRemoteBlocks = await Promise.all(removedBlockIds.map(async blockId => this.api.fetchEntity(blockId)));
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

    const blockIds = populatedContent.map(node => node.attrs?.id);

    batch(() => {
      this.upsertBlocksTriple(blockIds);

      populatedContent.forEach(node => {
        this.createParentEntityTriple(node);
        this.createBlockRowTypeTriple(node);
        this.createBlockTypeTriple(node);
        this.upsertBlockNameTriple(node);
        this.upsertBlockMarkdownTriple(node);
        this.createBlockImageTriple(node);
      });
    });
  };
}

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
