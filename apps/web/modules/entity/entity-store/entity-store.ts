import { SYSTEM_IDS } from '@geogenesis/ids';
import { computed, Observable, observable, ObservableComputed, observe } from '@legendapp/state';
import { A, pipe } from '@mobily/ts-belt';
import { Editor, generateHTML, JSONContent } from '@tiptap/core';

import TurndownService from 'turndown';
import { ActionsStore } from '~/modules/action';
import { htmlToPlainText } from '~/modules/components/entity/editor/editor-utils';
import { ID } from '~/modules/id';
import { INetwork } from '~/modules/services/network';
import { Triple } from '~/modules/triple';
import { Triple as TripleType } from '~/modules/types';
import { Value } from '~/modules/value';

const turndownService = new TurndownService();

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
  ActionsStore: ActionsStore;
  name: string;
}

export class EntityStore implements IEntityStore {
  private api: INetwork;
  id: string;
  spaceId: string;
  triples$: ObservableComputed<TripleType[]>;
  typeTriples$: ObservableComputed<TripleType[]>;
  schemaTriples$: Observable<TripleType[]> = observable<TripleType[]>([]);
  hiddenSchemaIds$: Observable<string[]> = observable<string[]>([]);
  ActionsStore: ActionsStore;
  abortController: AbortController = new AbortController();
  name: string;

  constructor({ api, initialTriples, initialSchemaTriples, spaceId, id, ActionsStore, name }: IEntityStoreConfig) {
    const defaultTriples = createInitialDefaultTriples(spaceId, id);

    this.id = id;
    this.api = api;
    this.name = name;
    this.schemaTriples$ = observable([...initialSchemaTriples, ...defaultTriples]);
    this.spaceId = spaceId;
    this.ActionsStore = ActionsStore;

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

      // console.log('schemaTriples', schemaTriples);

      // const globalActions = Object.values(this.ActionsStore.actions$.get()).flatMap(a => a);

      // const schemaTriplesWithNames = globalActions, schemaTriples;
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

  editorContentFromBlocks = (blocks: TripleType[][]): JSONContent => {
    console.log('blocks', blocks);

    return {
      type: 'doc',
      content: blocks.map(block => {
        return {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'Hello World',
            },
          ],
        };
      }),
    };
  };

  updateEditorBlocks = (editor: Editor) => {
    /* Iterate over TipTap nodes, produce entity blocks of type TABLE_BLOCK, TEXT_BLOCK, and IMAGE_BLOCK  */
    const { content = [] } = editor.getJSON();

    content.forEach(node => {
      const blockEntityId = node.attrs?.id;
      const rowTypeEntityId = node.attrs?.selectedType?.id;
      const isTableNode = node.type === 'tableNode';

      if (!blockEntityId) {
        return;
      }

      if (isTableNode && rowTypeEntityId) {
        const entityName = node.attrs?.selectedType?.name || '';

        console.log(node.attrs?.selectedType);

        const nameTriple = Triple.withId({
          space: this.spaceId,
          entityId: blockEntityId,
          entityName: entityName,
          attributeId: SYSTEM_IDS.TYPES,
          attributeName: 'Types',
          value: { id: ID.createValueId(), type: 'string', value: entityName },
        });

        const typeTriple = Triple.withId({
          space: this.spaceId,
          entityId: blockEntityId,
          entityName: entityName,
          attributeId: SYSTEM_IDS.TYPES,
          attributeName: 'Types',
          value: { id: SYSTEM_IDS.TABLE_BLOCK, type: 'entity', name: 'Table Block' },
        });

        const rowTypeTriple = Triple.withId({
          space: this.spaceId,
          entityId: blockEntityId,
          entityName: entityName,
          attributeId: SYSTEM_IDS.NAME,
          attributeName: 'Name',
          value: { id: rowTypeEntityId, type: 'entity', name: 'Table Block' },
        });

        const blockTriple = Triple.withId({
          space: this.spaceId,
          entityId: this.id,
          entityName: this.name,
          attributeId: SYSTEM_IDS.BLOCKS,
          attributeName: 'Blocks',
          value: { id: blockEntityId, type: 'entity', name: entityName },
        });

        this.ActionsStore.create(nameTriple);
        this.ActionsStore.create(typeTriple);
        this.ActionsStore.create(rowTypeTriple);
        this.ActionsStore.create(blockTriple);
      } else {
        const html = generateHTML({ type: 'doc', content: [node] }, editor.extensionManager.extensions);
        const nodeNameLength = 20;
        const entityName = htmlToPlainText(html).slice(0, nodeNameLength);
        const markdown = turndownService.turndown(html);

        const nameTriple = Triple.withId({
          space: this.spaceId,
          entityId: blockEntityId,
          entityName: entityName,
          attributeId: SYSTEM_IDS.NAME,
          attributeName: 'Name',
          value: { id: ID.createValueId(), type: 'string', value: entityName },
        });

        const typeTriple = Triple.withId({
          space: this.spaceId,
          entityId: blockEntityId,
          entityName: entityName,
          attributeId: SYSTEM_IDS.TYPES,
          attributeName: 'Types',
          value: { id: SYSTEM_IDS.TEXT_BLOCK, type: 'entity', name: 'Text Block' },
        });

        const markdownContentTriple = Triple.withId({
          space: this.spaceId,
          entityId: blockEntityId,
          entityName: entityName,
          attributeId: SYSTEM_IDS.MARKDOWN_CONTENT,
          attributeName: 'Name',
          value: { id: ID.createValueId(), type: 'string', value: markdown },
        });

        const blockTriple = Triple.withId({
          space: this.spaceId,
          entityId: this.id,
          entityName: this.name,
          attributeId: SYSTEM_IDS.BLOCKS,
          attributeName: 'Blocks',
          value: { id: blockEntityId, type: 'entity', name: entityName },
        });

        this.ActionsStore.create(nameTriple);
        this.ActionsStore.create(typeTriple);
        this.ActionsStore.create(markdownContentTriple);
        this.ActionsStore.create(blockTriple);
      }
    });
  };
}
