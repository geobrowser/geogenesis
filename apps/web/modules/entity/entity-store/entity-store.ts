import { SYSTEM_IDS } from '@geogenesis/ids';
import { batch, computed, Observable, observable, ObservableComputed, observe } from '@legendapp/state';
import { A, pipe } from '@mobily/ts-belt';
import { Editor, generateHTML, generateJSON, JSONContent } from '@tiptap/core';
import showdown from 'showdown';
import { ActionsStore } from '~/modules/action';
import { tiptapExtensions } from '~/modules/components/entity/editor/editor';
import { htmlToPlainText } from '~/modules/components/entity/editor/editor-utils';
import { ID } from '~/modules/id';
import { INetwork } from '~/modules/services/network';
import { Triple } from '~/modules/triple';
import { EntityValue, Triple as TripleType } from '~/modules/types';
import { Value } from '~/modules/value';
import { Entity } from '..';

const markdownConverter = new showdown.Converter();

interface IEntityStore {
  create(triple: TripleType): void;
  update(triple: TripleType, oldTriple: TripleType): void;
  remove(triple: TripleType): void;
}

export const createInitialDefaultTriples = (spaceId: string, entityId: string): TripleType[] => {
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
  api: INetwork;
  spaceId: string;
  id: string;
  initialTriples: TripleType[];
  initialSchemaTriples: TripleType[];
  initialBlockIdsTriple: TripleType | null;
  initialBlockTriples: TripleType[];
  ActionsStore: ActionsStore;
}

export class EntityStore implements IEntityStore {
  private api: INetwork;
  id: string;
  spaceId: string;
  triples$: ObservableComputed<TripleType[]>;
  blockIds$: ObservableComputed<string[]>;
  blockIdsTriple$: Observable<TripleType | null> = observable<TripleType | null>(null);
  blockTriples$: ObservableComputed<TripleType[]>;
  editorJson$: ObservableComputed<JSONContent>;
  typeTriples$: ObservableComputed<TripleType[]>;
  schemaTriples$: Observable<TripleType[]> = observable<TripleType[]>([]);
  hiddenSchemaIds$: Observable<string[]> = observable<string[]>([]);
  ActionsStore: ActionsStore;
  abortController: AbortController = new AbortController();
  name: ObservableComputed<string>;

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
    this.blockIdsTriple$ = observable(initialBlockIdsTriple);

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

    this.name = computed(() => {
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
    observe<TripleType[]>(e => {
      const typeTriples = this.typeTriples$.get();
      const previous = e.previous || [];

      // TODO: This isn't working
      if (!A.eq(previous, typeTriples, (a, b) => a.value.id === b.value.id)) {
        this.setSchemaTriples(typeTriples);
      }

      return typeTriples;
    });
  }

  setSchemaTriples = async (typeTriples: TripleType[]) => {
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

  create = (triple: TripleType) => this.ActionsStore.create(triple);
  remove = (triple: TripleType) => this.ActionsStore.remove(triple);
  update = (triple: TripleType, oldTriple: TripleType) => this.ActionsStore.update(triple, oldTriple);

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
    const blockEntityId = node.attrs?.id;
    const isTableNode = node.type === 'tableNode';

    if (isTableNode) {
      return `Table Block ${blockEntityId}`;
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
    const isTableNode = node.type === 'tableNode';

    const blockTypeValue: EntityValue = isTableNode
      ? { id: SYSTEM_IDS.TABLE_BLOCK, type: 'entity', name: 'Table Block' }
      : { id: SYSTEM_IDS.TEXT_BLOCK, type: 'entity', name: 'Text Block' };

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
    } else if (isUpdated) {
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
    const isTableNode = node.type === 'tableNode';

    if (isTableNode) {
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
          value: { id: this.id, type: 'entity', name: this.name.get() },
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

  /* 
  Helper function to create or update the block IDs on an entity
  Since we don't currently support array value types, we store all ordered blocks as a single stringified array 
  */
  upsertBlocksTriple = (blockIds: string[]) => {
    const existingBlockTriple = this.blockIdsTriple$.get();
    const isUpdated = existingBlockTriple && Value.stringValue(existingBlockTriple) !== JSON.stringify(blockIds);

    if (!existingBlockTriple) {
      const triple = Triple.withId({
        space: this.spaceId,
        entityId: this.id,
        entityName: this.name.get(),
        attributeId: SYSTEM_IDS.BLOCKS,
        attributeName: 'Blocks',
        value: {
          id: ID.createValueId(),
          type: 'string',
          value: JSON.stringify(blockIds),
        },
      });
      this.create(triple);
      this.blockIdsTriple$.set(triple);
    } else if (isUpdated) {
      const updatedTriple = Triple.ensureStableId({
        ...existingBlockTriple,
        value: {
          ...existingBlockTriple.value,
          type: 'string',
          value: JSON.stringify(blockIds),
        },
      });
      this.update(updatedTriple, existingBlockTriple);
      this.blockIdsTriple$.set(updatedTriple);
    }
  };

  /* Iterate over the content's of a TipTap editor to create or update triple blocks */
  updateEditorBlocks = (editor: Editor) => {
    const { content = [] } = editor.getJSON();

    const populatedContent = content.filter(node => {
      const isNonParagraph = node.type !== 'paragraph';
      const isParagraphWithContent =
        node.type === 'paragraph' && node.content && node.content.length > 0 && node.content[0].text;

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
      });
    });
  };
}
