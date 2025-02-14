'use client';

import { Relation as R, SYSTEM_IDS } from '@graphprotocol/grc-20';
import { Image } from '@graphprotocol/grc-20';
import { generateJSON as generateServerJSON } from '@tiptap/html';
import { JSONContent, generateJSON } from '@tiptap/react';
import { Array } from 'effect';
import { useSearchParams } from 'next/navigation';

import * as React from 'react';

import { getImageHash, getImagePath, validateEntityId } from '~/core/utils/utils';

import { tiptapExtensions } from '~/partials/editor/extensions';

import { makeInitialDataEntityRelations } from '../../blocks/data/initialize';
import { getTriples } from '../../database/triples';
import { DB } from '../../database/write';
import { ID } from '../../id';
import { EntityId } from '../../io/schema';
import { Relation, RenderableEntityType } from '../../types';
import { Values } from '../../utils/value';
import { getRelationForBlockType } from './block-types';
import { useEditorInstance } from './editor-provider';
import * as Parser from './parser';
import * as TextEntity from './text-entity';
import { Content } from './types';
import { RelationWithBlock, useBlocks } from './use-blocks';
import { getNodeId } from './utils';

interface UpsertBlocksRelationsArgs {
  entityId: string;
  nextBlocks: { id: string; type: Content['type'] }[];
  addedBlocks: { id: string; value: string }[];
  removedBlockIds: string[];
  blockRelations: RelationWithBlock[];
  spaceId: string;
  entityPageId: string;
}

// Helper function to create or update the block IDs on an entity
// Since we don't currently support array value types, we store all ordered blocks as a single stringified array
const makeBlocksRelations = async ({
  entityId,
  nextBlocks,
  blockRelations,
  spaceId,
  entityPageId,
  addedBlocks,
  removedBlockIds,
}: UpsertBlocksRelationsArgs) => {
  // We store the new collection items being created so we can check if the new
  // ordering for a block is dependent on other blocks being created at the same time.
  //
  // @TODO Ideally this isn't needed as ordering should be updated as the users are making
  // changes, but right now that would require updating the actions store for every keystroke
  // which could cause performance problems in the app. We need more granular reactive state
  // from our store to prevent potentially re-rendering _everything_ that depends on the store
  // when changes are made anywhere.
  const newBlocks: Relation[] = [];
  const nextBlockIds = nextBlocks.map(b => b.id);

  for (const addedBlock of addedBlocks) {
    const newRelationId = ID.createEntityId();
    const block = nextBlocks.find(b => b.id === addedBlock.id)!;

    const position = nextBlockIds.indexOf(addedBlock.id);
    // @TODO: noUncheckedIndexAccess
    const beforeBlockIndex = nextBlockIds[position - 1] as string | undefined;
    const afterBlockIndex = nextBlockIds[position + 1] as string | undefined;

    // Check both the existing blocks and any that are created as part of this update
    // tick. This is necessary as right now we don't update the Geo state until the
    // user blurs the editor. See the comment earlier in this function.
    const beforeCollectionItemIndex =
      blockRelations.find(c => c.block.id === beforeBlockIndex)?.index ??
      newBlocks.find(c => c.id === beforeBlockIndex)?.index;
    const afterCollectionItemIndex =
      blockRelations.find(c => c.block.id === afterBlockIndex)?.index ??
      newBlocks.find(c => c.id === afterBlockIndex)?.index;

    const newTripleOrdering = R.reorder({
      relationId: newRelationId,
      beforeIndex: beforeCollectionItemIndex,
      afterIndex: afterCollectionItemIndex,
    });

    const renderableType = ((): RenderableEntityType => {
      switch (block.type) {
        case 'paragraph':
        case 'text':
        case 'heading':
        case 'listItem':
        case 'bulletList':
        case 'orderedList':
          return 'TEXT';
        case 'tableNode':
          return 'DATA';
        case 'image':
          return 'IMAGE';
      }
    })();

    const newRelation: Relation = {
      space: spaceId,
      id: newRelationId,
      index: newTripleOrdering.triple.value.value,
      typeOf: {
        id: EntityId(SYSTEM_IDS.BLOCKS),
        name: 'Blocks',
      },
      toEntity: {
        id: EntityId(addedBlock.id),
        renderableType,
        name: null,
        value: addedBlock.value,
      },
      fromEntity: {
        id: EntityId(entityPageId),
        name: null,
      },
    };

    DB.upsertRelation({ relation: newRelation, spaceId });
    newBlocks.push(newRelation);
  }

  const relationIdsForRemovedBlocks = blockRelations.filter(r => removedBlockIds.includes(r.block.id));

  for (const relation of relationIdsForRemovedBlocks) {
    // @TODO(performance) removeMany
    DB.removeRelation({
      relationId: relation.relationId,
      fromEntityId: EntityId(entityId),
      spaceId,
    });
  }
};

export const useTabId = () => {
  const searchParams = useSearchParams();
  const maybeTabId = searchParams?.get('tabId');

  if (!validateEntityId(maybeTabId)) return null;

  const tabId = EntityId(maybeTabId as string);

  return tabId;
};

export function useEditorStore() {
  const { id: entityId, spaceId, initialBlockRelations, initialBlocks, initialTabs } = useEditorInstance();

  const tabId = useTabId();
  const activeEntityId = tabId ?? entityId;
  const isTab = React.useMemo(() => tabId && !!initialTabs && Object.hasOwn(initialTabs, tabId), [initialTabs, tabId]);

  const blockRelations = useBlocks(
    activeEntityId,
    isTab ? initialTabs![tabId as EntityId].entity.relationsOut : initialBlockRelations
  );

  const blockIds = React.useMemo(() => {
    return blockRelations.map(b => b.block.id);
  }, [blockRelations]);

  const initialBlockTriples = React.useMemo(() => {
    const blocks = isTab ? initialTabs![tabId as EntityId].blocks : initialBlocks;

    return blocks.flatMap(b => b.triples);
  }, [initialBlocks, initialTabs, isTab, tabId]);

  /**
   * Tiptap expects a JSON representation of the editor state, but we store our block state
   * in a Knowledge Graph-specific data model. We need to map from our KG representation
   * back to the Tiptap representation whenever the KG data changes.
   */
  const editorJson = React.useMemo(() => {
    const json = {
      type: 'doc',
      content: blockRelations.map(block => {
        const markdownTriplesForBlockId = getTriples({
          mergeWith: initialBlockTriples,
          selector: triple => triple.entityId === block.block.id && triple.attributeId === SYSTEM_IDS.MARKDOWN_CONTENT,
        });

        const markdownTripleForBlockId = markdownTriplesForBlockId[0];
        const relationForBlockId = blockRelations.find(r => r.block.id === block.block.id);

        const toEntity = relationForBlockId?.block;

        if (toEntity?.type === 'IMAGE') {
          return {
            type: 'image',
            attrs: {
              id: block.block.id,
              src: getImagePath(toEntity.value),
              relationId: block.relationId,
              spaceId,
              alt: '',
              title: '',
            },
          };
        }

        if (toEntity?.type === 'DATA') {
          return {
            type: 'tableNode',
            attrs: {
              id: block.block.id,
              relationId: block.relationId,
              spaceId,
            },
          };
        }

        const html = markdownTripleForBlockId
          ? Parser.markdownToHtml(Values.stringValue(markdownTripleForBlockId) || '')
          : '';
        /* SSR on custom react nodes doesn't seem to work out of the box at the moment */
        const isSSR = typeof window === 'undefined';
        const json = isSSR ? generateServerJSON(html, tiptapExtensions) : generateJSON(html, tiptapExtensions);
        const nodeData = json.content[0];

        return {
          ...nodeData,
          attrs: {
            ...nodeData.attrs,
            id: block.block.id,
            relationId: block.relationId,
            spaceId,
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
  }, [blockRelations, initialBlockTriples, spaceId]);

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
          type: node.type as Content['type'],
          attrs: node.attrs,
        };
      });

      const newBlockIds = newBlocks.map(b => b.id);

      const addedBlockIds = Array.difference(newBlockIds, blockIds);
      const addedBlocks = newBlocks.filter(b => addedBlockIds.includes(b.id));

      // Updating all of the Geo state as the editor state changes is complex. There are
      // many relations and entities created to create the graph of different block types
      // and any relations they have for themselves or with the entity from which they're
      // being consumed.
      //
      // To make modeling this easier, we should follow this pattern:
      // 1. Create and delete entities as they are added/removed (?)
      // 2. Create and remove relations consuming these entities as they are added/removed
      // 3. Update any individual relations, triples, or blocks as they are changed.
      //
      // One consideration is that we may want to consume already-existing entities
      // in a block, so we may not want to delete them.
      //
      // @TODO we can probably write all of these changes at once by aggregating the
      // "actions" then performing them. See our migrate module for this pattern.
      for (const node of addedBlocks) {
        const blockType = (() => {
          switch (node.type) {
            case 'tableNode':
              return SYSTEM_IDS.DATA_BLOCK;
            case 'bulletList':
            case 'paragraph':
              return SYSTEM_IDS.TEXT_BLOCK;
            case 'image':
              return SYSTEM_IDS.IMAGE_TYPE;
            default:
              return SYSTEM_IDS.TEXT_BLOCK;
          }
        })();

        // Create an entity with Types -> XBlock
        // @TODO: ImageBlock
        switch (blockType) {
          case SYSTEM_IDS.TEXT_BLOCK:
            DB.upsertRelation({ relation: getRelationForBlockType(node.id, SYSTEM_IDS.TEXT_BLOCK, spaceId), spaceId });
            break;
          case SYSTEM_IDS.IMAGE_TYPE: {
            const imageHash = getImageHash(node.attrs?.src);
            const imageUrl = `ipfs://${imageHash}`;
            const { ops } = Image.make(imageUrl);
            const [, setTripleOp] = ops;

            DB.upsertRelation({ relation: getRelationForBlockType(node.id, SYSTEM_IDS.IMAGE_TYPE, spaceId), spaceId });

            DB.upsert(
              {
                value: {
                  type: 'URL',
                  value: setTripleOp.triple.value.value,
                },
                entityId: node.id,
                attributeId: setTripleOp.triple.attribute,
                entityName: null,
                attributeName: 'Image URL',
              },
              spaceId
            );

            break;
          }
          case SYSTEM_IDS.DATA_BLOCK: {
            // @TODO(performance): upsertMany
            for (const relation of makeInitialDataEntityRelations(EntityId(node.id), spaceId)) {
              DB.upsertRelation({ relation, spaceId });
            }

            break;
          }
        }
      }

      const removedBlockIds = Array.difference(blockIds, newBlockIds);

      for (const removedBlockId of removedBlockIds) {
        // @TODO(performance) removeMany
        DB.removeEntity(removedBlockId, spaceId);
      }

      makeBlocksRelations({
        entityId: activeEntityId,
        nextBlocks: newBlocks,
        addedBlocks: addedBlocks.map(block => {
          const imageHash = getImageHash(block.attrs?.src ?? '');
          const imageUrl = `ipfs://${imageHash}`;

          return { id: block.id, value: imageHash === '' ? block.id : imageUrl };
        }),
        removedBlockIds,
        spaceId,
        blockRelations: blockRelations,
        entityPageId: activeEntityId,
      });

      /**
       * After creating/deleting any blocks and relations we set any updated
       * ops for the current set of blocks. e.g., updating a text block's name.
       */
      for (const node of populatedContent) {
        switch (node.type) {
          case 'tableNode':
            // createTableBlockMetadata(node);
            break;
          case 'bulletList':
          case 'heading':
          case 'paragraph': {
            const ops = TextEntity.getTextEntityOps(node);
            DB.upsertMany(ops, spaceId);
            break;
          }
          case 'image':
            break;
          default:
            break;
        }
      }
    },
    [blockIds, activeEntityId, spaceId, blockRelations]
  );

  return {
    upsertEditorState,
    editorJson,
    blockIds,
    blockRelations,
  };
}
