'use client';

import { SYSTEM_IDS, createCollection, createCollectionItem, reorderCollectionItem } from '@geogenesis/sdk';
import { A } from '@mobily/ts-belt';
import { Editor } from '@tiptap/core';
import { JSONContent, generateHTML, generateJSON } from '@tiptap/react';
import { atom, useAtomValue } from 'jotai';
import pluralize from 'pluralize';
import Showdown from 'showdown';

import * as React from 'react';

import { tiptapExtensions } from '~/partials/editor/editor';
import { htmlToPlainText } from '~/partials/editor/editor-utils';

import { TableBlockSdk } from '../blocks-sdk';
import { fetchEntity } from '../io/subgraph';
import { CollectionItem, AppEntityValue as EntityValue, Triple as ITriple, OmitStrict } from '../types';
import { Collections } from '../utils/collections';
import { Triple } from '../utils/triple';
import { getImagePath, groupBy } from '../utils/utils';
import { Value } from '../utils/value';
import { activeTriplesForEntityIdSelector, localTriplesAtom, remove, upsert } from './actions-store/actions-store';

const markdownConverter = new Showdown.Converter();

// We don't care about the value of the collection item in the block editor or
// any of the entity properties except the id.
interface BlockCollectionItem extends OmitStrict<CollectionItem, 'value' | 'entity'> {
  entityId: string;
}

const createBlocksCollectionIdAtom = (initialBlocksIdsTriple: ITriple | null, entityId: string) => {
  return atom(get => {
    const triplesForEntityId = get(localTriplesAtom).filter(activeTriplesForEntityIdSelector(entityId));
    const entityChanges = Triple.merge(triplesForEntityId, initialBlocksIdsTriple ? [initialBlocksIdsTriple] : []);
    const blocksIdTriple: ITriple | undefined = entityChanges.find(t => t.attributeId === SYSTEM_IDS.BLOCKS);
    const triple = blocksIdTriple ?? initialBlocksIdsTriple;

    if (triple?.value.type !== 'COLLECTION') {
      return null;
    }

    // Favor the local version of the blockIdsTriple's collection value id if it exists
    return triple?.value.value ?? null;
  });
};

const createCollectionItemsAtom = (initialBlockCollectionItemTriples: ITriple[], blocksCollectionId: string | null) => {
  return atom(get => {
    if (!blocksCollectionId) {
      return [];
    }

    const localTriples = get(localTriplesAtom);

    const collectionItemEntityIdsForCollectionId = Triple.merge(
      localTriples.filter(
        a =>
          a.attributeId === SYSTEM_IDS.COLLECTION_ITEM_COLLECTION_ID_REFERENCE_ATTRIBUTE &&
          a.value.value === blocksCollectionId &&
          a.isDeleted === false
      ),
      initialBlockCollectionItemTriples
    ).map(t => t.entityId);

    // Gather all of the triples for each collection item associated with the block list's
    // collection entity id. We use this below to create the data structure representing
    // the collection item itself.
    const allTriplesForCollectionItems = Triple.merge(
      localTriples.filter(t => collectionItemEntityIdsForCollectionId.includes(t.entityId)),
      initialBlockCollectionItemTriples
    );

    const collectionItemTriplesByCollectionItemId = groupBy(allTriplesForCollectionItems, c => c.entityId);

    // @TODO: Abstract this
    // Map all of the triples for each collection item into a CollectionItem data structure.
    // If not all of the elements of the collection item exist we don't create the item.
    const items = Object.entries(collectionItemTriplesByCollectionItemId).map(
      ([collectionItemId, items]): BlockCollectionItem | null => {
        const index = items.find(i => Boolean(Collections.itemIndexValue(i)))?.value.value;
        const collectionId = items.find(i => Boolean(Collections.itemCollectionIdValue(i)))?.value.value;
        const entityId = items.find(i => Boolean(Collections.itemEntityIdValue(i)))?.value.value;

        if (!(index && collectionId && entityId)) {
          return null;
        }

        return {
          id: collectionItemId,
          collectionId,
          entityId: entityId,
          index,
        };
      }
    );

    return items
      .flatMap(i => (i ? [i] : []))
      .sort((a, z) => {
        if (a.index < z.index) {
          return -1;
        }
        if (a.index > z.index) {
          return 1;
        }
        return 0;
      });
  });
};

const createBlockTriplesAtom = (initialBlockTriples: ITriple[], blockIds: string[]) => {
  return atom(get => {
    const localTriplesForBlockIds = get(localTriplesAtom).filter(
      t => blockIds.includes(t.entityId) && t.isDeleted === false
    );
    return Triple.merge(localTriplesForBlockIds, initialBlockTriples);
  });
};

/**
 * The editor store manages state for the entity page blocks editor, primarily
 * around transforming/mapping metadata for each block to our Geo entity format
 * and back to Tiptap's JSON format.
 *
 * 1. Maps our entity/block format to Tiptap's JSON format
 * 2. Tracks the triple with the editor block ids
 * 3. Manages the metadata for each block entity, e.g., the block name, block type,
 *    markdown content, image src, table configuration, etc.
 */
export function useEditorStore() {
  const {
    id: entityId,
    spaceId,
    initialBlockIdsTriple,
    initialBlockTriples,
    initialBlockCollectionItemTriples,
  } = useEditorInstance();

  const blocksCollectionId = useAtomValue(
    React.useMemo(
      () => createBlocksCollectionIdAtom(initialBlockIdsTriple, entityId),
      [initialBlockIdsTriple, entityId]
    )
  );

  const collectionItems = useAtomValue(
    React.useMemo(
      () => createCollectionItemsAtom(initialBlockCollectionItemTriples, blocksCollectionId),
      [initialBlockCollectionItemTriples, blocksCollectionId]
    )
  );

  const blockIds = React.useMemo(() => {
    return collectionItems.map(ci => ci.entityId);
  }, [collectionItems]);

  const blockTriples = useAtomValue(
    React.useMemo(() => createBlockTriplesAtom(initialBlockTriples, blockIds), [initialBlockTriples, blockIds])
  );

  // Transforms our block triples back into a TipTap-friendly JSON format
  const editorJson = React.useMemo(() => {
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
              spaceId,
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
              spaceId,
              id: blockId,
              typeId: rowTypeTriple.value.value,
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
  }, [blockIds, blockTriples, spaceId]);

  const getBlockTriple = React.useCallback(
    ({ entityId, attributeId }: { entityId: string; attributeId: string }) => {
      return blockTriples.find(t => t.entityId === entityId && t.attributeId === attributeId);
    },
    [blockTriples]
  );

  // Helper function for creating a new block of type TABLE_BLOCK, TEXT_BLOCK, or IMAGE_BLOCK
  // We don't support changing types of blocks, so all we need to do is create a new block with the new type
  const createBlockTypeTriple = React.useCallback(
    (node: JSONContent) => {
      const blockEntityId = getNodeId(node);
      const entityName = getNodeName(node);

      const blockTypeValue: EntityValue = getBlockTypeValue(node.type);

      const existingBlockTriple = getBlockTriple({ entityId: blockEntityId, attributeId: SYSTEM_IDS.TYPES });

      if (!existingBlockTriple) {
        upsert(
          {
            type: 'SET_TRIPLE',
            entityId: blockEntityId,
            entityName: entityName,
            attributeId: SYSTEM_IDS.TYPES,
            attributeName: 'Types',
            value: blockTypeValue,
          },
          spaceId
        );
      }
    },
    [upsert, getBlockTriple, spaceId]
  );

  // Helper function for upserting a new block name triple for TABLE_BLOCK, TEXT_BLOCK, or IMAGE_BLOCK
  const upsertBlockNameTriple = React.useCallback(
    (node: JSONContent) => {
      const blockEntityId = getNodeId(node);
      const entityName = getNodeName(node);

      upsert(
        {
          type: 'SET_TRIPLE',
          entityId: blockEntityId,
          entityName: entityName,
          attributeId: SYSTEM_IDS.NAME,
          attributeName: 'Name',
          value: { type: 'TEXT', value: entityName },
        },
        spaceId
      );
    },
    [upsert, getBlockTriple, spaceId]
  );

  // Helper function for upserting a new block markdown content triple for TEXT_BLOCKs only
  const upsertBlockMarkdownTriple = React.useCallback(
    (node: JSONContent) => {
      const blockEntityId = getNodeId(node);
      const isImageNode = node.type === 'image';
      const isTableNode = node.type === 'tableNode';
      const isList = node.type === 'bulletList';

      if (isImageNode || isTableNode) {
        return null;
      }

      const nodeHTML = textNodeHTML(node);

      const entityName = getNodeName(node);
      let markdown = markdownConverter.makeMarkdown(nodeHTML);

      //  Overrides Showdown's unwanted "consecutive list" behavior found in
      //  `src/subParsers/makeMarkdown/list.js`
      if (isList) {
        markdown = markdown.replaceAll('\n<!-- -->\n', '');
      }

      upsert(
        {
          type: 'SET_TRIPLE',
          entityId: blockEntityId,
          entityName: entityName,
          attributeId: SYSTEM_IDS.MARKDOWN_CONTENT,
          attributeName: 'Markdown Content',
          value: { type: 'TEXT', value: markdown },
        },
        spaceId
      );
    },
    [upsert, getBlockTriple]
  );

  // Helper function for creating a new row type triple for TABLE_BLOCKs only
  const createTableBlockMetadata = React.useCallback(
    (node: JSONContent) => {
      const blockEntityId = getNodeId(node);
      const isTableNode = node.type === 'tableNode';
      const rowTypeEntityId = node.attrs?.typeId;
      const rowTypeEntityName = node.attrs?.typeName;

      if (!isTableNode) {
        return null;
      }

      const existingRowTypeTriple = getBlockTriple({ entityId: blockEntityId, attributeId: SYSTEM_IDS.ROW_TYPE });

      if (!existingRowTypeTriple) {
        upsert(
          {
            type: 'SET_TRIPLE',
            entityId: blockEntityId,
            entityName: getNodeName(node),
            attributeId: SYSTEM_IDS.ROW_TYPE,
            attributeName: 'Row Type',
            value: { type: 'ENTITY', name: rowTypeEntityName, value: rowTypeEntityId },
          },
          spaceId
        );

        // Make sure that we only add it for new tables by also checking that the row type triple doesn't exist.
        // Typically the row type triple only gets added when the table is created. Otherwise this will create
        // a new filter for every table block that doesn't have one every time the content of the editor is changed.
        // Generally the filter triple _also_ won't exist if the row type doesn't, but we check to be safe.
        const existingFilterTriple = getBlockTriple({ entityId: blockEntityId, attributeId: SYSTEM_IDS.FILTER });

        if (!existingFilterTriple) {
          upsert(
            {
              type: 'SET_TRIPLE',
              entityId: blockEntityId,
              entityName: getNodeName(node),
              attributeId: SYSTEM_IDS.FILTER,
              attributeName: 'Row Type',
              value: {
                type: 'TEXT',
                value: TableBlockSdk.createGraphQLStringFromFilters(
                  [
                    {
                      columnId: SYSTEM_IDS.SPACE,
                      valueType: 'TEXT',
                      value: spaceId,
                    },
                  ],
                  rowTypeEntityId
                ),
              },
            },
            spaceId
          );
        }
      }
    },
    [upsert, getBlockTriple, spaceId]
  );

  // Helper function for creating a new block image triple for IMAGE_BLOCKs only
  const createBlockImageTriple = React.useCallback(
    (node: JSONContent) => {
      const blockEntityId = getNodeId(node);
      const isImageNode = node.type === 'image';

      if (!isImageNode || !node.attrs?.src) {
        return null;
      }

      const { src, id } = node.attrs;

      upsert(
        {
          type: 'SET_TRIPLE',
          entityId: blockEntityId,
          entityName: getNodeName(node),
          attributeId: SYSTEM_IDS.IMAGE_ATTRIBUTE,
          attributeName: 'Image',
          value: { type: 'IMAGE', value: id, image: Value.toImageValue(src) },
        },
        spaceId
      );
    },
    [upsert, spaceId]
  );

  // Helper function to create or update the block IDs on an entity
  // Since we don't currently support array value types, we store all ordered blocks as a single stringified array
  const upsertBlocksTriple = React.useCallback(
    async (newBlockIds: string[]) => {
      const existingBlocksCollectionId = blocksCollectionId;
      const prevBlockIds = blockIds;

      // Returns the blockIds that exist in prevBlockIds, but do not exist in newBlockIds
      const removedBlockIds = A.difference(prevBlockIds, newBlockIds);
      const addedBlockIds = A.difference(newBlockIds, prevBlockIds);
      const collectionId = existingBlocksCollectionId
        ? existingBlocksCollectionId
        : createCollection().payload.entityId;

      if (!existingBlocksCollectionId && newBlockIds.length > 0) {
        upsert(
          {
            type: 'SET_TRIPLE',
            entityId: collectionId,
            attributeId: SYSTEM_IDS.TYPES,
            entityName: null,
            attributeName: null,
            value: {
              type: 'ENTITY',
              value: SYSTEM_IDS.COLLECTION_TYPE,
              name: null,
            },
          },
          spaceId
        );

        upsert(
          {
            type: 'SET_TRIPLE',
            entityId: entityId,
            // entityName: name,
            entityName: '@TODO: Replace',
            attributeId: SYSTEM_IDS.BLOCKS,
            attributeName: 'Blocks',
            value: {
              type: 'COLLECTION',
              value: collectionId,
              // @TODO: What do we put here? We aren't using it in the UI anywhere
              // so maybe we can just leave it empty since we don't actually render
              // the blocks list in the triples list.
              items: [],
            },
          },
          spaceId
        );
      }

      /**
       * @TODO: Rethink the best way to structure state of the edit in the Geo state
       * vs. the Editor state.
       */
      // We store the new collection items being created so we can check if the new
      // ordering for a block is dependent on other blocks being created at the same time.
      //
      // @TODO: Ideally this isn't needed as ordering should be updated as the users are making
      // changes, but right now that would require updating the actions store for every keystroke
      // which could cause performance problems in the app. We need more granular reactive state
      // from our store to prevent potentially re-rendering _everything_ that depends on the store
      // when changes are made anywhere.
      const newCollectionItems: BlockCollectionItem[] = [];

      for (const addedBlock of addedBlockIds) {
        const [typeOp, collectionOp, entityOp, indexOp] = createCollectionItem({
          collectionId,
          entityId: addedBlock,
          // @TODO: index
          spaceId,
        });

        upsert(
          {
            type: 'SET_TRIPLE',
            attributeName: 'Types',
            entityName: null,
            attributeId: typeOp.payload.attributeId,
            entityId: typeOp.payload.entityId,
            value: {
              type: 'ENTITY',
              name: 'Collection Item',
              value: typeOp.payload.value.value,
            },
          },
          spaceId
        );

        upsert(
          {
            type: 'SET_TRIPLE',
            attributeName: 'Collection reference',
            entityName: null,
            attributeId: collectionOp.payload.attributeId,
            entityId: collectionOp.payload.entityId,
            value: {
              type: 'ENTITY',
              name: null,
              value: collectionOp.payload.value.value,
            },
          },
          spaceId
        );

        upsert(
          {
            type: 'SET_TRIPLE',
            attributeName: 'Entity reference',
            entityName: null,
            attributeId: entityOp.payload.attributeId,
            entityId: entityOp.payload.entityId,
            value: {
              type: 'ENTITY',
              name: null,
              value: entityOp.payload.value.value,
            },
          },
          spaceId
        );

        const position = newBlockIds.indexOf(addedBlock);
        // @TODO: noUncheckedIndexAccess
        const beforeBlockIndex = newBlockIds[position - 1] as string | undefined;
        const afterBlockIndex = newBlockIds[position + 1] as string | undefined;

        // Check both the existing collection items and any that are created as part of this
        // same update tick. This is necessary as right now we don't update the Geo state
        // until the user blurs the editor. See the comment earlier in this function.
        const beforeCollectionItemIndex =
          collectionItems.find(c => c.entityId === beforeBlockIndex)?.index ??
          newCollectionItems.find(c => c.entityId === beforeBlockIndex)?.index;
        const afterCollectionItemIndex =
          collectionItems.find(c => c.entityId === afterBlockIndex)?.index ??
          newCollectionItems.find(c => c.entityId === afterBlockIndex)?.index;

        const newTripleOrdering = reorderCollectionItem({
          collectionItemId: indexOp.payload.entityId,
          beforeIndex: beforeCollectionItemIndex,
          afterIndex: afterCollectionItemIndex,
        });

        upsert(
          {
            type: 'SET_TRIPLE',
            attributeName: 'Index',
            entityName: null,
            attributeId: indexOp.payload.attributeId,
            entityId: indexOp.payload.entityId,
            value: {
              type: 'TEXT',
              value: newTripleOrdering.payload.value.value,
            },
          },
          spaceId
        );

        newCollectionItems.push({
          collectionId,
          entityId: entityOp.payload.value.value, // The id of the block the item points to
          id: entityOp.payload.entityId, // The id of the collection item itself
          index: newTripleOrdering.payload.value.value,
        });
      }

      // If a block is deleted we want to make sure that we delete the block entity as well.
      // The block entity might exist remotely, so we need to fetch all the triple associated
      // with that block entity in order to delete them all.
      //
      // Additionally,there may be local triples associated with the block entity that we need
      // to delete.
      if (!removedBlockIds) return;

      const removedCollectionItems = collectionItems.filter(c => removedBlockIds.includes(c.entityId));

      // Delete all collection items referencing the removed blocks
      removedCollectionItems.forEach(c => {
        remove(
          {
            attributeId: SYSTEM_IDS.TYPES,
            entityId: c.id,
          },
          spaceId
        );

        remove(
          {
            attributeId: SYSTEM_IDS.COLLECTION_ITEM_COLLECTION_ID_REFERENCE_ATTRIBUTE,
            entityId: c.id,
          },
          spaceId
        );

        remove(
          {
            attributeId: SYSTEM_IDS.COLLECTION_ITEM_ENTITY_REFERENCE,
            entityId: c.id,
          },
          spaceId
        );

        remove(
          {
            attributeId: SYSTEM_IDS.COLLECTION_ITEM_INDEX,
            entityId: c.id,
          },
          spaceId
        );
      });

      // Fetch all the subgraph data for all the deleted block entities.
      const maybeRemoteBlocks = await Promise.all(
        // @TODO: Can use a single fetchEntities with id_in
        removedBlockIds.map(async blockId => fetchEntity({ id: blockId }))
      );
      const remoteBlocks = maybeRemoteBlocks.flatMap(block => (block ? [block] : []));

      // To delete an entity we delete all of its triples
      remoteBlocks.forEach(block => {
        block.triples.forEach(t => remove(t, spaceId));
      });

      // Delete any local triples associated with the deleted block entities
      // @TODO: Put back
      // const localTriplesForDeletedBlocks = pipe(
      //   allTriples,
      //   actions => Triple.merge(actions, []),
      //   triples => triples.filter(t => removedBlockIds.includes(t.entityId))
      // );

      // localTriplesForDeletedBlocks.forEach(t => remove(t, spaceId));

      // We delete the existingBlockTriple if the page content is completely empty
      if (newBlockIds.length === 0) {
        remove(
          {
            attributeId: SYSTEM_IDS.BLOCKS,
            entityId,
          },
          spaceId
        );

        // Delete the collection
        remove(
          {
            attributeId: SYSTEM_IDS.TYPES,
            entityId: collectionId,
          },
          spaceId
        );
      }
    },
    // [allTriples, blockIds, blocksCollectionId, upsert, entityId, name, remove, subgraph, spaceId, collectionItems]
    [blockIds, blocksCollectionId, upsert, entityId, remove, spaceId, collectionItems]
  );

  // Iterate over the content's of a TipTap editor to create or update triple blocks
  // @TODO: We should instead only execute functions for each block type, instead of
  // executing _every_ function for every block type.
  const updateEditorBlocks = React.useCallback(
    (editor: Editor) => {
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

      const newBlockIds = populatedContent.map(node => getNodeId(node));
      upsertBlocksTriple(newBlockIds);

      populatedContent.forEach(node => {
        createTableBlockMetadata(node);
        createBlockTypeTriple(node);
        upsertBlockNameTriple(node);
        upsertBlockMarkdownTriple(node);
        createBlockImageTriple(node);
      });
    },
    [
      createBlockImageTriple,
      createBlockTypeTriple,
      createTableBlockMetadata,
      upsertBlocksTriple,
      upsertBlockMarkdownTriple,
      upsertBlockNameTriple,
    ]
  );

  return {
    blockIds,
    collectionId: blocksCollectionId,
    collectionItems,
    editorJson,
    updateEditorBlocks,
  };
}

/* Helper function for transforming a single node of TipTap's JSONContent structure into HTML */
const textNodeHTML = (node: JSONContent): string => {
  return generateHTML({ type: 'doc', content: [node] }, tiptapExtensions);
};

/* Helper function for getting the human-readable, plain-text name of a node */
const getNodeName = (node: JSONContent): string => {
  const isTableNode = node.type === 'tableNode';

  if (isTableNode) {
    return `${pluralize(node.attrs?.typeName, 2, false)}`;
  }

  const nodeHTML = textNodeHTML(node);
  const nodeNameLength = 20;
  return htmlToPlainText(nodeHTML).slice(0, nodeNameLength);
};

// Returns the id of the first paragraph even if nested inside of a list
const getNodeId = (node: JSONContent): string => node.attrs?.id ?? node?.content?.[0]?.content?.[0]?.attrs?.id;

const getBlockTypeValue = (nodeType?: string): EntityValue => {
  switch (nodeType) {
    case 'paragraph':
      return { value: SYSTEM_IDS.TEXT_BLOCK, type: 'ENTITY', name: 'Text Block' };
    case 'image':
      return { value: SYSTEM_IDS.IMAGE_BLOCK, type: 'ENTITY', name: 'Image Block' };
    case 'tableNode':
      return { value: SYSTEM_IDS.TABLE_BLOCK, type: 'ENTITY', name: 'Table Block' };
    default:
      return { value: SYSTEM_IDS.TEXT_BLOCK, type: 'ENTITY', name: 'Text Block' };
  }
};

const EditorContext = React.createContext<OmitStrict<Props, 'children'> | null>(null);

interface Props {
  id: string;
  spaceId: string;
  initialBlockIdsTriple: ITriple | null;
  initialBlockTriples: ITriple[];
  initialBlockCollectionItems: CollectionItem[];
  initialBlockCollectionItemTriples: ITriple[];
  children: React.ReactNode;
}

export const EditorProvider = ({
  id,
  spaceId,
  initialBlockIdsTriple,
  initialBlockTriples,
  initialBlockCollectionItems,
  initialBlockCollectionItemTriples,
  children,
}: Props) => {
  const value = React.useMemo(() => {
    return {
      id,
      spaceId,
      initialBlockIdsTriple,
      initialBlockTriples,
      initialBlockCollectionItems,
      initialBlockCollectionItemTriples,
    };
  }, [id, spaceId, initialBlockIdsTriple, initialBlockTriples]);

  return <EditorContext.Provider value={value}>{children}</EditorContext.Provider>;
};

export function useEditorInstance() {
  const value = React.useContext(EditorContext);

  if (!value) {
    throw new Error(`Missing EditorProvider`);
  }

  return value;
}
