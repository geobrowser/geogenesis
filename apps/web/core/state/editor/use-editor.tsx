'use client';

import { IdUtils, Position, SystemIds } from '@graphprotocol/grc-20';
import { generateJSON as generateServerJSON } from '@tiptap/html';
import { JSONContent, generateJSON } from '@tiptap/react';
import { useAtom } from 'jotai';
import { useSearchParams } from 'next/navigation';

import * as React from 'react';

import { VIDEO_BLOCK_TYPE, VIDEO_URL_PROPERTY } from '~/core/constants';
import { storage } from '~/core/sync/use-mutate';
import { getValues, useValues } from '~/core/sync/use-store';
import { getImageHash, getImagePath, getVideoPath, validateEntityId } from '~/core/utils/utils';
import { Relation, RenderableEntityType } from '~/core/v2.types';

import { tiptapExtensions } from '~/partials/editor/extensions';

import { makeInitialDataEntityRelations } from '../../blocks/data/initialize';
import { ID } from '../../id';
import { EntityId } from '../../io/schema';
import { getRelationForBlockType } from './block-types';
import { useEditorInstance } from './editor-provider';
import { getBlockPositionChanges } from './get-block-position-changes';
import * as Parser from './parser';
import * as TextEntity from './text-entity';
import { Content } from './types';
import { RelationWithBlock, useBlocks } from './use-blocks';
import { getNodeId } from './utils';
import { editorHasContentAtom } from '~/atoms';

interface MakeNewBlockArgs {
  addedBlock: { id: string; value: string };
  tiptapBlock: { id: string; type: Content['type'] };
  spaceId: string;
  nextBlockIds: string[];
  newBlocks: Relation[];
  blockRelations: RelationWithBlock[];
  entityPageId: string;
}

function makeNewBlockRelation({
  tiptapBlock,
  addedBlock,
  nextBlockIds,
  blockRelations,
  spaceId,
  newBlocks,
  entityPageId,
}: MakeNewBlockArgs) {
  const newRelationId = ID.createEntityId();

  const position = nextBlockIds.indexOf(addedBlock.id);

  // @TODO: noUncheckedIndexAccess
  const beforeBlockIndex = nextBlockIds[position - 1] as string | undefined;
  const afterBlockIndex = nextBlockIds[position + 1] as string | undefined;

  // Create a unified array with consistent structure for both blockRelations and newBlocks
  const allRelations = [
    ...blockRelations.map(r => ({
      toEntity: { id: r.block.id },
      // @TODO(migration): default position
      position: r.position ?? 'a0',
    })),
    ...newBlocks.map(b => ({
      toEntity: { id: b.toEntity.id },
      // @TODO(migration): default position
      position: b.position ?? 'a0',
    })),
  ].sort((a, b) => (a.position < b.position ? -1 : 1));

  // Check both the existing blocks and any that are created as part of this update
  // tick. This is necessary as right now we don't update the Geo state until the
  // user blurs the editor. See the comment earlier in this function.
  const beforeCollectionItemIndex = allRelations.find(c => c.toEntity.id === beforeBlockIndex)?.position;

  // When the afterCollectionItemIndex is undefined, we need to use the next block of beforeBlockIndex
  const afterCollectionItemIndex =
    allRelations.find(c => c.toEntity.id === afterBlockIndex)?.position ??
    allRelations[allRelations.findIndex(c => c.position === beforeCollectionItemIndex) + 1]?.position;

  const newBlockOrdering = Position.generateBetween(
    beforeCollectionItemIndex ?? null,
    afterCollectionItemIndex ?? null
  );

  const renderableType = ((): RenderableEntityType => {
    switch (tiptapBlock.type) {
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
      case 'video':
        return 'VIDEO';
    }
  })();

  const newRelation: Relation = {
    spaceId: spaceId,
    id: newRelationId,
    position: newBlockOrdering,
    verified: false,
    entityId: IdUtils.generate(),
    renderableType,
    type: {
      id: SystemIds.BLOCKS,
      name: 'Blocks',
    },
    toEntity: {
      id: addedBlock.id,
      name: null,
      value: addedBlock.value,
    },
    fromEntity: {
      id: entityPageId,
      name: null,
    },
  };

  return newRelation;
}

interface UpsertBlocksRelationsArgs {
  nextBlocks: { id: string; type: Content['type'] }[];
  addedBlocks: { id: string; value: string }[];
  movedBlocks: { id: string; value: string }[];
  removedBlockIds: string[];
  blockRelations: RelationWithBlock[];
  spaceId: string;
  entityPageId: string;
}

// Helper function to create or update the block IDs on an entity
// Since we don't currently support array value types, we store all ordered blocks as a single stringified array
const makeBlocksRelations = async ({
  nextBlocks,
  blockRelations,
  spaceId,
  entityPageId,
  addedBlocks,
  removedBlockIds,
  movedBlocks,
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
    const tiptapBlock = nextBlocks.find(b => b.id === addedBlock.id)!;

    const newRelation = makeNewBlockRelation({
      tiptapBlock,
      addedBlock,
      nextBlockIds,
      blockRelations,
      spaceId,
      newBlocks,
      entityPageId,
    });

    storage.relations.set(newRelation);
    newBlocks.push(newRelation);
  }

  const relationIdsForRemovedBlocks = blockRelations.filter(r => removedBlockIds.includes(r.block.id));

  for (const relation of relationIdsForRemovedBlocks) {
    // @TODO(performance) removeMany
    storage.relations.delete(relation);
  }

  for (const movedBlock of movedBlocks) {
    const relationForMovedBlock = blockRelations.find(r => r.block.id === movedBlock.id);

    if (relationForMovedBlock) {
      storage.relations.delete(relationForMovedBlock);
    }

    const newRelation = makeNewBlockRelation({
      tiptapBlock: nextBlocks.find(b => b.id === movedBlock.id)!,
      addedBlock: movedBlock,
      nextBlockIds,
      blockRelations,
      spaceId,
      newBlocks,
      entityPageId,
    });

    storage.relations.set(newRelation);
  }
};

export const useTabId = () => {
  const searchParams = useSearchParams();
  const maybeTabId = searchParams?.get('tabId');

  if (!validateEntityId(maybeTabId)) return null;

  return maybeTabId;
};

export function useEditorStore() {
  const { id: entityId, spaceId, initialBlockRelations, initialBlocks, initialTabs } = useEditorInstance();
  const [hasContent, setHasContent] = useAtom(editorHasContentAtom);

  const tabId = useTabId();
  const activeEntityId = tabId ?? entityId;
  const isTab = React.useMemo(() => tabId && !!initialTabs && Object.hasOwn(initialTabs, tabId), [initialTabs, tabId]);

  const blockRelations = useBlocks(
    activeEntityId,
    spaceId,
    isTab ? initialTabs![tabId as EntityId].entity.relations : initialBlockRelations
  );

  const blockIds = React.useMemo(() => {
    return blockRelations.map(b => b.block.id);
  }, [blockRelations]);

  const initialBlockValues = React.useMemo(() => {
    const blocks = isTab ? initialTabs![tabId as EntityId].blocks : initialBlocks;

    return blocks.flatMap(b => b.values);
  }, [initialBlocks, initialTabs, isTab, tabId]);

  // Subscribe to markdown content changes for all text blocks.
  // This ensures editorJson re-computes when text content is edited.
  const markdownValues = useValues({
    selector: value => blockIds.includes(value.entity.id) && value.property.id === SystemIds.MARKDOWN_CONTENT,
  });

  /**
   * Tiptap expects a JSON representation of the editor state, but we store our block state
   * in a Knowledge Graph-specific data model. We need to map from our KG representation
   * back to the Tiptap representation whenever the KG data changes.
   */
  const editorJson = React.useMemo(() => {
    const json = {
      type: 'doc',
      content: blockRelations.map(block => {
        // Find the markdown value for this block. Prefer local (reactive) values over initial server values.
        // Local values from markdownValues take precedence since they reflect user edits.
        const markdownValueForBlockId =
          markdownValues.find(v => v.entity.id === block.block.id) ??
          initialBlockValues.find(
            v => v.entity.id === block.block.id && v.property.id === SystemIds.MARKDOWN_CONTENT
          );
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

        if (toEntity?.type === 'VIDEO') {
          // Read video URL from Values using VIDEO_URL_PROPERTY
          const videoUrlValues = getValues({
            mergeWith: initialBlockValues,
            selector: value => value.entity.id === block.block.id && value.property.id === VIDEO_URL_PROPERTY,
          });
          const videoUrlValue = videoUrlValues?.[0]?.value || toEntity.value;

          // Read video title from Values using NAME_PROPERTY
          const titleValues = getValues({
            mergeWith: initialBlockValues,
            selector: value => value.entity.id === block.block.id && value.property.id === SystemIds.NAME_PROPERTY,
          });
          const titleValue = titleValues?.[0]?.value || '';

          return {
            type: 'video',
            attrs: {
              id: block.block.id,
              src: getVideoPath(videoUrlValue),
              title: titleValue,
              relationId: block.relationId,
              spaceId,
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

        const html = markdownValueForBlockId ? Parser.markdownToHtml(markdownValueForBlockId.value || '') : '';
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
      });
    }

    return json;
  }, [blockRelations, spaceId, initialBlockValues, markdownValues]);

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

      // We also need to check the re-ordering of any blocks. If a block has been reordered then
      // we need to calculate it's new position.
      //
      // Q:
      // Does tiptap copy metadata about the block when you copy-paste it in the editor?

      const { added, removed, moved } = getBlockPositionChanges(blockIds, newBlockIds);

      const addedBlocks = newBlocks.filter(b => added.includes(b.id));
      const movedBlocks = newBlocks.filter(b => moved.includes(b.id));

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
              return SystemIds.DATA_BLOCK;
            case 'bulletList':
            case 'paragraph':
              return SystemIds.TEXT_BLOCK;
            case 'image':
              return SystemIds.IMAGE_TYPE;
            case 'video':
              return VIDEO_BLOCK_TYPE;
            default:
              return SystemIds.TEXT_BLOCK;
          }
        })();

        // Create an entity with Types -> XBlock
        // @TODO: ImageBlock
        switch (blockType) {
          case SystemIds.TEXT_BLOCK: {
            const relation = getRelationForBlockType(node.id, SystemIds.TEXT_BLOCK, spaceId);
            storage.relations.set(relation);
            break;
          }
          case SystemIds.IMAGE_TYPE: {
            const imageHash = getImageHash(node.attrs?.src);
            const imageUrl = `ipfs://${imageHash}`;

            // const { ops } = Image.make({ cid: imageUrl });
            // const [, setTripleOp] = ops;

            // DB.upsertRelation({ relation: getRelationForBlockType(node.id, SystemIds.IMAGE_TYPE, spaceId), spaceId });

            // if (setTripleOp.type === 'SET_TRIPLE') {
            //   DB.upsert(
            //     {
            //       value: {
            //         type: 'URL',
            //         value: setTripleOp.triple.value.value,
            //       },
            //       entityId: node.id,
            //       attributeId: setTripleOp.triple.attribute,
            //       entityName: null,
            //       attributeName: 'Image URL',
            //     },
            //     spaceId
            //   );
            // }

            break;
          }
          case VIDEO_BLOCK_TYPE: {
            // Create a Types relation to mark this entity as a Video Block type
            const relation = getRelationForBlockType(node.id, VIDEO_BLOCK_TYPE, spaceId);
            storage.relations.set(relation);
            break;
          }
          case SystemIds.DATA_BLOCK: {
            // @TODO(performance): upsertMany
            for (const relation of makeInitialDataEntityRelations(EntityId(node.id), spaceId)) {
              storage.relations.set(relation);
            }

            break;
          }
        }
      }

      for (const removedBlockId of removed) {
        // @TODO(performance) removeMany
        // @TODO(migration): Delete block entity
      }

      makeBlocksRelations({
        nextBlocks: newBlocks,
        addedBlocks: addedBlocks.map(block => {
          // For image blocks, store the ipfs URL in toEntity.value
          // For video blocks, just use the block ID (URL is stored as a Value with VIDEO_URL_PROPERTY)
          if (block.type === 'image') {
            const imageHash = getImageHash(block.attrs?.src ?? '');
            const imageUrl = `ipfs://${imageHash}`;
            return { id: block.id, value: imageHash === '' ? block.id : imageUrl };
          }
          // Video blocks and other blocks use block ID as the value
          return { id: block.id, value: block.id };
        }),
        removedBlockIds: removed,
        movedBlocks: movedBlocks.map(block => {
          // For image blocks, store the ipfs URL in toEntity.value
          // For video blocks, just use the block ID (URL is stored as a Value with VIDEO_URL_PROPERTY)
          if (block.type === 'image') {
            const imageHash = getImageHash(block.attrs?.src ?? '');
            const imageUrl = `ipfs://${imageHash}`;
            return { id: block.id, value: imageHash === '' ? block.id : imageUrl };
          }
          // Video blocks and other blocks use block ID as the value
          return { id: block.id, value: block.id };
        }),
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
            const markdownValue = TextEntity.getTextEntityMarkdownValue(node);
            storage.values.set(markdownValue);

            break;
          }
          case 'image': {
            // Update the relation if the image src has changed
            const existingRelation = blockRelations.find(r => r.block.id === node.attrs?.id);
            if (existingRelation && node.attrs?.src) {
              const imageHash = getImageHash(node.attrs.src);
              const imageUrl = `ipfs://${imageHash}`;
              // Only update if the value has changed
              if (existingRelation.toEntity.value !== imageUrl && imageHash !== '') {
                const updatedRelation: Relation = {
                  ...existingRelation,
                  toEntity: {
                    ...existingRelation.toEntity,
                    value: imageUrl,
                  },
                };
                storage.relations.set(updatedRelation);
              }
            }
            break;
          }
          case 'video':
            // Video block persistence is handled directly in video-node.tsx component
            // using storage.entities.name.set() for title
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
    hasContent,
    setHasContent,
  };
}
