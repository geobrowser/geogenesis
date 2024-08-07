'use client';

import { SYSTEM_IDS, createRelationship, reorderCollectionItem } from '@geogenesis/sdk';
import { A } from '@mobily/ts-belt';
import { Editor } from '@tiptap/core';
import { generateJSON as generateServerJSON } from '@tiptap/html';
import { JSONContent, generateHTML, generateJSON } from '@tiptap/react';
import { atom, useAtomValue } from 'jotai';
import pluralize from 'pluralize';
import Showdown from 'showdown';

import * as React from 'react';

import { tiptapExtensions } from '~/partials/editor/editor';
import { htmlToPlainText } from '~/partials/editor/editor-utils';

import { TableBlockSdk } from '../blocks-sdk';
import { Entity, Relation } from '../io/dto/entities';
import { EntityId, TypeId } from '../io/schema';
import { fetchEntity } from '../io/subgraph';
import { CollectionItem, AppEntityValue as EntityValue, OmitStrict } from '../types';
import { getImagePath } from '../utils/utils';
import { Values } from '../utils/value';
import { remove, upsert } from './actions-store/actions-store';
import { createRelationsForEntityAtom } from './actions-store/create-relations-for-entity-atom';

// @TODO: Make custom markdown converter specifically for tiptap. Doing so should
// be a lot smaller and faster than showdown.
const markdownConverter = new Showdown.Converter();

// We don't care about the value of the collection item in the block editor or
// any of the entity properties except the id.
// @TODO(relations): Use a relation
interface BlockRelation extends OmitStrict<CollectionItem, 'value' | 'entity'> {
  entityId: string;
}

interface RelationWithBlock {
  relationId: EntityId;
  typeOfId: TypeId;
  index: string;
  block: Entity;
}

const createMergedBlockRelationsAtom = (
  initialRelations: Relation[],
  initialBlocks: Entity[],
  entityPageId: string
) => {
  return atom(get => {
    const relationsForEntityId = get(createRelationsForEntityAtom(entityPageId, initialRelations));

    /************************************** */
    // Merging blocks is a different process from merging relations. We can compose merging relations
    // and merging blocks together with two different functions.
    /************************************** */

    // @TODO: Get local blocks
    const blocksByBlockId = initialBlocks.reduce((acc, block) => {
      acc.set(block.id, block);
      return acc;
    }, new Map<string, Entity>());

    // 1. Group the RelationWithBlock entities with their block
    const relationsWithBlocks = relationsForEntityId
      .map(r => {
        const block = blocksByBlockId.get(r.toEntity.id);

        if (!block) {
          return null;
        }

        return {
          typeOfId: TypeId(r.typeOf.id),
          index: r.index,
          block,
          relationId: r.id,
        };
      })
      .filter(b => b !== null);

    return relationsWithBlocks.sort((a, z) => {
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
  const { id: entityId, spaceId, initialBlockRelations, initialBlocks } = useEditorInstance();

  const relations: RelationWithBlock[] = useAtomValue(
    React.useMemo(
      () => createMergedBlockRelationsAtom(initialBlockRelations, initialBlocks, entityId),
      [initialBlockRelations, entityId, initialBlocks, spaceId]
    )
  );

  const blockIds = React.useMemo(() => {
    return relations.map(b => b.block.id);
  }, [relations]);

  // Transforms our block triples back into a TipTap-friendly JSON format
  const editorJson = React.useMemo(() => {
    const json = {
      type: 'doc',
      content: blockIds.map(blockId => {
        const relationForBlockId = relations.find(r => r.block.id === blockId);
        const blockTriples = relationForBlockId?.block.triples ?? [];

        const markdownTriple = blockTriples.find(
          triple => triple.entityId === blockId && triple.attributeId === SYSTEM_IDS.MARKDOWN_CONTENT
        );

        const toEntity = relationForBlockId?.block;
        const value = getBlockValueForBlockType(toEntity);

        if (value?.type === 'IMAGE') {
          return {
            type: 'image',
            attrs: {
              spaceId,
              id: blockId,
              src: getImagePath(value.value),
              alt: '',
              title: '',
            },
          };
        }

        if (value?.type === 'DATA') {
          return {
            type: 'tableNode',
            attrs: {
              spaceId,
              id: blockId,
              typeId: value.value,
              typeName: value.name,
            },
          };
        }

        const html = markdownTriple ? markdownConverter.makeHtml(Values.stringValue(markdownTriple) || '') : '';
        /* SSR on custom react nodes doesn't seem to work out of the box at the moment */
        const isSSR = typeof window === 'undefined';
        const json = isSSR ? generateServerJSON(html, tiptapExtensions) : generateJSON(html, tiptapExtensions);
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
  }, [blockIds, spaceId, relations]);

  const getBlockTriple = React.useCallback(
    ({ entityId, attributeId }: { entityId: string; attributeId: string }) => {
      return relations
        .flatMap(r => r.block.triples)
        .find(t => t.entityId === entityId && t.attributeId === attributeId);
    },
    [relations]
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
    [getBlockTriple, spaceId]
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
    [spaceId]
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
    [spaceId]
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
    [spaceId, getBlockTriple]
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
          value: { type: 'IMAGE', value: id, image: Values.toImageValue(src) },
        },
        spaceId
      );
    },
    [spaceId]
  );

  // Helper function to create or update the block IDs on an entity
  // Since we don't currently support array value types, we store all ordered blocks as a single stringified array
  // @TODO(relations): fix
  const upsertBlocksTriple = React.useCallback(
    async (newBlockIds: string[]) => {
      const prevBlockIds = blockIds;

      // Returns the blockIds that exist in prevBlockIds, but do not exist in newBlockIds
      const removedBlockIds = A.difference(prevBlockIds, newBlockIds);
      const addedBlockIds = A.difference(newBlockIds, prevBlockIds);

      if (newBlockIds.length > 0) {
        upsert(
          {
            type: 'SET_TRIPLE',
            entityId: entityId,
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
        const newCollectionItems: BlockRelation[] = [];

        for (const addedBlock of addedBlockIds) {
          const [typeOp, collectionOp, entityOp, indexOp] = createRelationship({
            relationTypeId: SYSTEM_IDS.BLOCKS,
            fromId: entityId,
            toId: addedBlock,
            // @TODO: index (what does this TODO mean???)
            spaceId,
          });

          upsert(
            {
              type: 'SET_TRIPLE',
              attributeName: 'Types',
              entityName: null,
              attributeId: typeOp.triple.attribute,
              entityId: typeOp.triple.entity,
              value: {
                type: 'ENTITY',
                name: 'Collection Item',
                value: typeOp.triple.value.value,
              },
            },
            spaceId
          );

          upsert(
            {
              type: 'SET_TRIPLE',
              attributeName: 'Collection reference',
              entityName: null,
              attributeId: collectionOp.triple.attribute,
              entityId: collectionOp.triple.entity,
              value: {
                type: 'ENTITY',
                name: null,
                value: collectionOp.triple.value.value,
              },
            },
            spaceId
          );

          upsert(
            {
              type: 'SET_TRIPLE',
              attributeName: 'Entity reference',
              entityName: null,
              attributeId: entityOp.triple.attribute,
              entityId: entityOp.triple.entity,
              value: {
                type: 'ENTITY',
                name: null,
                value: entityOp.triple.value.value,
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
            relations.find(c => c.block.id === beforeBlockIndex)?.index ??
            newCollectionItems.find(c => c.entityId === beforeBlockIndex)?.index;
          const afterCollectionItemIndex =
            relations.find(c => c.block.id === afterBlockIndex)?.index ??
            newCollectionItems.find(c => c.entityId === afterBlockIndex)?.index;

          const newTripleOrdering = reorderCollectionItem({
            collectionItemId: indexOp.triple.entity,
            beforeIndex: beforeCollectionItemIndex,
            afterIndex: afterCollectionItemIndex,
          });

          upsert(
            {
              type: 'SET_TRIPLE',
              attributeName: 'Index',
              entityName: null,
              attributeId: indexOp.triple.attribute,
              entityId: indexOp.triple.entity,
              value: {
                type: 'TEXT',
                value: newTripleOrdering.triple.value.value,
              },
            },
            spaceId
          );

          newCollectionItems.push({
            collectionId: entityId,
            entityId: entityOp.triple.value.value, // The id of the block the item points to
            id: entityOp.triple.entity, // The id of the collection item itself
            index: newTripleOrdering.triple.value.value,
          });
        }

        // If a block is deleted we want to make sure that we delete the block entity as well.
        // The block entity might exist remotely, so we need to fetch all the triple associated
        // with that block entity in order to delete them all.
        //
        // Additionally,there may be local triples associated with the block entity that we need
        // to delete.
        if (!removedBlockIds) return;

        const removedCollectionItems = relations.filter(c => removedBlockIds.includes(c.block.id));

        // Delete all collection items referencing the removed blocks
        removedCollectionItems.forEach(c => {
          remove(
            {
              attributeId: SYSTEM_IDS.TYPES,
              entityId: c.relationId,
            },
            spaceId
          );

          remove(
            {
              attributeId: SYSTEM_IDS.RELATION_FROM_ATTRIBUTE,
              entityId: c.relationId,
            },
            spaceId
          );

          remove(
            {
              attributeId: SYSTEM_IDS.RELATION_TO_ATTRIBUTE,
              entityId: c.relationId,
            },
            spaceId
          );

          remove(
            {
              attributeId: SYSTEM_IDS.RELATION_INDEX,
              entityId: c.relationId,
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
              entityId: entityId,
            },
            spaceId
          );
        }
      }
    },
    [blockIds, entityId, spaceId, relations]
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
    collectionItems: relations,
    editorJson,
    updateEditorBlocks,
  };
}

function getBlockValueForBlockType(
  block?: Entity
): { type: 'IMAGE' | 'TEXT' | 'DATA'; value: string; name: string | null } | null {
  if (!block) {
    return null;
  }

  const blockTypes = block.types.map(t => t.id);

  const isTextBlock = blockTypes?.includes(TypeId(SYSTEM_IDS.TEXT_BLOCK));
  const isTableBlock = blockTypes?.includes(TypeId(SYSTEM_IDS.TABLE_BLOCK));
  const isImageBlock = blockTypes?.includes(TypeId(SYSTEM_IDS.IMAGE_BLOCK));

  if (isTextBlock) {
    const value = block.triples.find(t => t.attributeId === SYSTEM_IDS.MARKDOWN_CONTENT)?.value.value;

    return value
      ? {
          type: 'TEXT',
          value: value ?? '',
          name: null,
        }
      : null;
  }

  if (isTableBlock) {
    const rowType = block.relationsOut.find(r => r.typeOf.id === EntityId(SYSTEM_IDS.ROW_TYPE));
    return rowType ? { type: 'DATA', value: rowType.toEntity.id, name: rowType.toEntity.name } : null;
  }

  if (isImageBlock) {
    const value = block.relationsOut.find(r => r.typeOf.id === EntityId(SYSTEM_IDS.IMAGE_ATTRIBUTE))?.toEntity.id;
    return value ? { type: 'IMAGE', value, name: null } : null;
  }

  return null;
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
  initialBlocks: Entity[];
  initialBlockRelations: Relation[];
  children: React.ReactNode;
}

export const EditorProvider = ({ id, spaceId, initialBlocks, initialBlockRelations, children }: Props) => {
  const value = React.useMemo(() => {
    return {
      id,
      spaceId,
      initialBlockRelations,
      initialBlocks,
    };
  }, [id, spaceId, initialBlockRelations, initialBlocks]);

  return <EditorContext.Provider value={value}>{children}</EditorContext.Provider>;
};

export function useEditorInstance() {
  const value = React.useContext(EditorContext);

  if (!value) {
    throw new Error(`Missing EditorProvider`);
  }

  return value;
}
