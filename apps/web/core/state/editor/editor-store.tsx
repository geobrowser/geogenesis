'use client';

import { SYSTEM_IDS, reorderCollectionItem } from '@geogenesis/sdk';
import { INITIAL_COLLECTION_ITEM_INDEX_VALUE } from '@geogenesis/sdk/constants';
import { A } from '@mobily/ts-belt';
import { generateJSON as generateServerJSON } from '@tiptap/html';
import { JSONContent, generateJSON } from '@tiptap/react';

import * as React from 'react';

import { tiptapExtensions } from '~/partials/editor/extensions';

import { useRelations } from '../../database/relations';
import { getTriples } from '../../database/triples';
import { DB } from '../../database/write';
import { ID } from '../../id';
import { Entity, Relation } from '../../io/dto/entities';
import { EntityId, TypeId } from '../../io/schema';
import { RenderableEntityType } from '../../types';
import { Values } from '../../utils/value';
import { useEditorInstance } from './editor-provider';
import { markdownToHtml } from './parser';
import { getTextBlockOps } from './text-block';
import { getNodeId } from './utils';

interface RelationWithBlock {
  relationId: EntityId;
  typeOfId: TypeId;
  index: string;
  block: {
    id: EntityId;
    type: RenderableEntityType;
    value: string;
  };
}

function relationToRelationWithBlock(r: Relation): RelationWithBlock {
  return {
    typeOfId: TypeId(r.typeOf.id),
    index: r.index,
    block: {
      id: r.toEntity.id,
      type: r.toEntity.renderableType,
      value: r.toEntity.value,
    },
    relationId: r.id,
  };
}

function sortByIndex(a: RelationWithBlock, z: RelationWithBlock) {
  if (a.index < z.index) {
    return -1;
  }
  if (a.index > z.index) {
    return 1;
  }
  return 0;
}

interface UpsertBlocksRelationsArgs {
  newBlockIds: string[];
  blocks: RelationWithBlock[];
  spaceId: string;
  entityPageId: string;
}

// Helper function to create or update the block IDs on an entity
// Since we don't currently support array value types, we store all ordered blocks as a single stringified array
const upsertBlocksRelations = async ({ newBlockIds, blocks, spaceId, entityPageId }: UpsertBlocksRelationsArgs) => {
  const prevBlockIds = blocks.map(b => b.block.id);

  // Returns the blockIds that exist in prevBlockIds, but do not exist in newBlockIds
  const removedBlockIds = A.difference(prevBlockIds, newBlockIds);
  const addedBlockIds = A.difference(newBlockIds, prevBlockIds);

  if (newBlockIds.length > 0) {
    // We store the new collection items being created so we can check if the new
    // ordering for a block is dependent on other blocks being created at the same time.
    //
    // @TODO: Ideally this isn't needed as ordering should be updated as the users are making
    // changes, but right now that would require updating the actions store for every keystroke
    // which could cause performance problems in the app. We need more granular reactive state
    // from our store to prevent potentially re-rendering _everything_ that depends on the store
    // when changes are made anywhere.
    const newBlocks: Relation[] = [];

    for (const addedBlock of addedBlockIds) {
      const newRelationId = ID.createEntityId();

      const position = newBlockIds.indexOf(addedBlock);
      // @TODO: noUncheckedIndexAccess
      const beforeBlockIndex = newBlockIds[position - 1] as string | undefined;
      const afterBlockIndex = newBlockIds[position + 1] as string | undefined;

      // Check both the existing blocks and any that are created as part of this update
      // tick. This is necessary as right now we don't update the Geo state until the
      // user blurs the editor. See the comment earlier in this function.
      const beforeCollectionItemIndex =
        blocks.find(c => c.block.id === beforeBlockIndex)?.index ??
        newBlocks.find(c => c.id === beforeBlockIndex)?.index;
      const afterCollectionItemIndex =
        blocks.find(c => c.block.id === afterBlockIndex)?.index ?? newBlocks.find(c => c.id === afterBlockIndex)?.index;

      const newTripleOrdering = reorderCollectionItem({
        collectionItemId: newRelationId,
        beforeIndex: beforeCollectionItemIndex,
        afterIndex: afterCollectionItemIndex,
      });

      const newRelation: Relation = {
        id: newRelationId,
        index: newTripleOrdering.triple.value.value,
        typeOf: {
          id: EntityId(SYSTEM_IDS.BLOCKS),
          name: 'Blocks',
        },
        toEntity: {
          id: EntityId(addedBlock),
          renderableType: 'RELATION',
          name: null,
          value: addedBlock,
        },
        fromEntity: {
          id: EntityId(entityPageId),
          name: null,
        },
      };

      DB.upsertRelation({ relation: newRelation, spaceId });
      newBlocks.push(newRelation);
    }

    // If a block is deleted we want to make sure that we delete the block entity as well.
    // The block entity might exist remotely, so we need to fetch all the triple associated
    // with that block entity in order to delete them all.
    //
    // Additionally,there may be local triples associated with the block entity that we need
    // to delete.
    // if (!removedBlockIds) return;

    // const removedCollectionItems = relations.filter(c => removedBlockIds.includes(c.block.id));

    // Delete all collection items referencing the removed blocks
    // removedCollectionItems.forEach(c => {
    //   // @TODO: Delete relations
    //   remove(
    //     {
    //       attributeId: SYSTEM_IDS.TYPES,
    //       entityId: c.relationId,
    //     },
    //     spaceId
    //   );

    //   remove(
    //     {
    //       attributeId: SYSTEM_IDS.RELATION_FROM_ATTRIBUTE,
    //       entityId: c.relationId,
    //     },
    //     spaceId
    //   );

    //   remove(
    //     {
    //       attributeId: SYSTEM_IDS.RELATION_TO_ATTRIBUTE,
    //       entityId: c.relationId,
    //     },
    //     spaceId
    //   );

    //   remove(
    //     {
    //       attributeId: SYSTEM_IDS.RELATION_INDEX,
    //       entityId: c.relationId,
    //     },
    //     spaceId
    //   );
    // });

    // Fetch all the subgraph data for all the deleted block entities.
    // const maybeRemoteBlocks = await Promise.all(
    //   // @TODO: Can use a single fetchEntities with id_in
    //   removedBlockIds.map(async blockId => fetchEntity({ id: blockId }))
    // );
    // const remoteBlocks = maybeRemoteBlocks.flatMap(block => (block ? [block] : []));

    // // To delete an entity we delete all of its triples
    // remoteBlocks.forEach(block => {
    //   // @TODO: Also delete all relations coming from the block
    //   block.triples.forEach(t => remove(t, spaceId));
    // });

    // Delete any local triples associated with the deleted block entities
    // @TODO: Put back
    // const localTriplesForDeletedBlocks = pipe(
    //   allTriples,
    //   actions => Triple.merge(actions, []),
    //   triples => triples.filter(t => removedBlockIds.includes(t.entityId))
    // );

    // localTriplesForDeletedBlocks.forEach(t => remove(t, spaceId));

    // We delete the existingBlockTriple if the page content is completely empty
    // if (newBlockIds.length === 0) {
    //   remove(
    //     {
    //       attributeId: SYSTEM_IDS.BLOCKS,
    //       entityId,
    //     },
    //     spaceId
    //   );

    //   // Delete the collection
    //   remove(
    //     {
    //       attributeId: SYSTEM_IDS.TYPES,
    //       entityId: entityId,
    //     },
    //     spaceId
    //   );
    // }
  }
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

  const blocks = useRelations(
    React.useMemo(() => {
      return {
        mergeWith: initialBlockRelations,
        selector: r => r.fromEntity.id === entityId && r.typeOf.id === EntityId(SYSTEM_IDS.BLOCKS),
      };
    }, [initialBlockRelations, entityId])
  )
    .map(relationToRelationWithBlock)
    .sort(sortByIndex);

  const blockIds = React.useMemo(() => {
    return blocks.map(b => b.block.id);
  }, [blocks]);

  // Transforms our block triples back into a TipTap-friendly JSON format
  const editorJson = React.useMemo(() => {
    const json = {
      type: 'doc',
      content: blockIds.map(blockId => {
        const markdownTriplesForBlockId = getTriples({
          mergeWith: initialBlocks.flatMap(b => b.triples),
          selector: triple => triple.entityId === blockId && triple.attributeId === SYSTEM_IDS.MARKDOWN_CONTENT,
        });

        const markdownTripleForBlockId = markdownTriplesForBlockId[0];
        const relationForBlockId = blocks.find(r => r.block.id === blockId);
        const toEntity = relationForBlockId?.block.id;

        // @TODO: Support image and data blocks
        // const value = getBlockValueForBlockType(toEntity);

        // if (value?.type === 'IMAGE') {
        //   return {
        //     type: 'image',
        //     attrs: {
        //       spaceId,
        //       id: blockId,
        //       src: getImagePath(value.value),
        //       alt: '',
        //       title: '',
        //     },
        //   };
        // }

        // if (value?.type === 'DATA') {
        //   return {
        //     type: 'tableNode',
        //     attrs: {
        //       spaceId,
        //       id: blockId,
        //       typeId: value.value,
        //       typeName: value.name,
        //     },
        //   };
        // }

        const html = markdownTripleForBlockId ? markdownToHtml(Values.stringValue(markdownTripleForBlockId) || '') : '';
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
  }, [blockIds, blocks, initialBlocks]);

  const upsertEditorState = React.useCallback(
    (json: JSONContent) => {
      const { content = [] } = json;

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

      const newBlocks = populatedContent.map(node => {
        return {
          id: getNodeId(node),
          type: node.type,
        };
      });

      const newBlockIds = newBlocks.map(b => b.id);

      // @TODO: See which blocks are new and create those as necessary
      const addedBlockIds = new Set(A.difference(newBlockIds, blockIds));
      const addedBlocks = newBlocks.filter(b => addedBlockIds.has(b.id));

      // Create entities for each new block. e.g., you add a text block,
      // so we need to create a new entity for it.
      //
      // upsertBlockRelations handles creating the relations for each block.
      // @TODO: How should we handle adding vs updating block? Should they
      // be in the same expression? Right now the main reason we split it up
      // is to avoid creating new relations and triples if they already exist.
      // New triples get upserted, but that would create a new entry in the
      // actions count.
      for (const node of addedBlocks) {
        const blockEntityId = getNodeId(node);

        const blockType = (() => {
          switch (node.type) {
            case 'tableNode':
              return SYSTEM_IDS.TABLE_BLOCK;
            case 'bulletList':
            case 'paragraph':
              return SYSTEM_IDS.TEXT_BLOCK;
            case 'image':
              return SYSTEM_IDS.IMAGE_BLOCK;
            default:
              return SYSTEM_IDS.TEXT_BLOCK;
          }
        })();

        // Create an entity with Types -> XBlock
        // @TODO: Create the block entity
        // @TODO: TableBlock
        // @TODO: TextBlock
        // @TODO: ImageBlock
        DB.upsertRelation({
          relation: {
            index: INITIAL_COLLECTION_ITEM_INDEX_VALUE,
            typeOf: {
              id: EntityId(SYSTEM_IDS.TYPES),
              name: 'Types',
            },
            toEntity: {
              id: EntityId(blockEntityId),
              renderableType: 'RELATION',
              name: null,
              value: blockType,
            },
            fromEntity: {
              id: EntityId(node.id),
              name: null,
            },
          },
          spaceId,
        });
      }

      upsertBlocksRelations({ newBlockIds, spaceId, blocks, entityPageId: entityId });

      for (const node of populatedContent) {
        switch (node.type) {
          case 'tableNode':
            // createTableBlockMetadata(node);
            break;
          case 'bulletList':
          case 'paragraph': {
            const ops = getTextBlockOps(node);
            DB.upsertMany(ops, spaceId);
            break;
          }

          case 'image':
            // createBlockImageTriple(node);
            break;
          default:
            break;
        }

        // createTableBlockMetadata(node);
        // // @TODO: Block type triple should be a relation?
        // upsertBlockNameTriple(node);
        // upsertBlockMarkdownTriple(node);
        // // @TODO: Block image triple should be a relation?
        // createBlockImageTriple(node);
      }
    },
    [spaceId, blocks, blockIds, entityId]
  );

  return {
    upsertEditorState,
    editorJson,
    blockIds,
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
