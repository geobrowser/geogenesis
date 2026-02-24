'use client';

import { IdUtils, Position, SystemIds } from '@geoprotocol/geo-sdk';
import { generateJSON as generateServerJSON } from '@tiptap/html';
import { JSONContent, generateJSON } from '@tiptap/react';
import { useAtom } from 'jotai';
import { useSearchParams } from 'next/navigation';

import * as React from 'react';

import { PDF_TYPE } from '~/core/constants';
import { storage } from '~/core/sync/use-mutate';
import { getRelations, getValues, useValues } from '~/core/sync/use-store';
import { Relation, RenderableEntityType, Value } from '~/core/types';
import { getImagePath, getVideoPath, validateEntityId } from '~/core/utils/utils';

import { tiptapExtensions } from '~/partials/editor/extensions';

import { makeInitialDataEntityRelations } from '../../blocks/data/initialize';
import { ID } from '../../id';
import { EntityId } from '../../io/substream-schema';
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
      case 'pdf':
        return 'PDF';
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

function deleteBlockEntityData(blockId: string, spaceId: string, initialValues: Value[], initialRelations: Relation[]) {
  const blockValues = getValues({
    mergeWith: initialValues,
    selector: v => v.entity.id === blockId && v.spaceId === spaceId,
  });

  for (const value of blockValues) {
    storage.values.delete(value);
  }

  const blockRelations = getRelations({
    mergeWith: initialRelations,
    selector: r => r.fromEntity.id === blockId && r.spaceId === spaceId,
  });

  for (const relation of blockRelations) {
    storage.relations.delete(relation);
  }
}

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

  const initialBlockEntities = React.useMemo(() => {
    return isTab ? initialTabs![tabId as EntityId].blocks : initialBlocks;
  }, [initialBlocks, initialTabs, isTab, tabId]);

  const initialBlockValues = React.useMemo(() => {
    return initialBlockEntities.flatMap(b => b.values);
  }, [initialBlockEntities]);

  const initialBlockEntityRelations = React.useMemo(() => {
    return initialBlockEntities.flatMap(b => b.relations);
  }, [initialBlockEntities]);

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
      content: blockRelations.flatMap(block => {
        // Find the markdown value for this block. Prefer local (reactive) values over initial server values.
        // Local values from markdownValues take precedence since they reflect user edits.
        const markdownValueForBlockId =
          markdownValues.find(v => v.entity.id === block.block.id) ??
          initialBlockValues.find(v => v.entity.id === block.block.id && v.property.id === SystemIds.MARKDOWN_CONTENT);
        const relationForBlockId = blockRelations.find(r => r.block.id === block.block.id);

        const toEntity = relationForBlockId?.block;

        if (toEntity?.type === 'IMAGE') {
          // Read image URL from Values using IMAGE_URL_PROPERTY (unified IPFS URL property)
          const imageUrlValues = getValues({
            mergeWith: initialBlockValues,
            selector: value => value.entity.id === block.block.id && value.property.id === SystemIds.IMAGE_URL_PROPERTY,
          });
          const imageUrlValue = imageUrlValues?.[0]?.value || toEntity.value;

          // Read image title from Values using NAME_PROPERTY
          const titleValues = getValues({
            mergeWith: initialBlockValues,
            selector: value => value.entity.id === block.block.id && value.property.id === SystemIds.NAME_PROPERTY,
          });
          const titleValue = titleValues?.[0]?.value || '';

          return [
            {
              type: 'image',
              attrs: {
                id: block.block.id,
                src: getImagePath(imageUrlValue),
                title: titleValue,
                relationId: block.relationId,
                spaceId,
              },
            },
          ];
        }

        if (toEntity?.type === 'PDF') {
          return {
            type: 'pdf',
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
          // Read video URL from Values using IMAGE_URL_PROPERTY (unified IPFS URL property)
          const videoUrlValues = getValues({
            mergeWith: initialBlockValues,
            selector: value => value.entity.id === block.block.id && value.property.id === SystemIds.IMAGE_URL_PROPERTY,
          });
          const videoUrlValue = videoUrlValues?.[0]?.value || toEntity.value;

          // Read video title from Values using NAME_PROPERTY
          const titleValues = getValues({
            mergeWith: initialBlockValues,
            selector: value => value.entity.id === block.block.id && value.property.id === SystemIds.NAME_PROPERTY,
          });
          const titleValue = titleValues?.[0]?.value || '';

          return [
            {
              type: 'video',
              attrs: {
                id: block.block.id,
                src: getVideoPath(videoUrlValue),
                title: titleValue,
                relationId: block.relationId,
                spaceId,
              },
            },
          ];
        }

        if (toEntity?.type === 'DATA') {
          return [
            {
              type: 'tableNode',
              attrs: {
                id: block.block.id,
                relationId: block.relationId,
                spaceId,
              },
            },
          ];
        }

        const html = markdownValueForBlockId ? Parser.markdownToHtml(markdownValueForBlockId.value || '') : '';
        /* SSR on custom react nodes doesn't seem to work out of the box at the moment */
        const isSSR = typeof window === 'undefined';
        const json = isSSR ? generateServerJSON(html, tiptapExtensions) : generateJSON(html, tiptapExtensions);

        // A single block's markdown can produce multiple Tiptap nodes (e.g. heading + paragraph + list).
        // Return all of them so multi-element content renders fully.
        if (!json.content || json.content.length === 0) {
          return [
            {
              type: 'paragraph',
              attrs: {
                id: block.block.id,
                relationId: block.relationId,
                spaceId,
              },
            },
          ];
        }

        return json.content.map((nodeData: JSONContent, index: number) => ({
          ...nodeData,
          attrs: {
            ...nodeData.attrs,
            // First node keeps the block's real id. Continuation nodes get null so
            // id-extension assigns fresh unique IDs on first blur, cleanly splitting
            // multi-element markdown into separate blocks without a dedup storm.
            id: index === 0 ? block.block.id : null,
            relationId: block.relationId,
            spaceId,
          },
        }));
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
              return SystemIds.VIDEO_TYPE;
            case 'pdf':
              return PDF_TYPE;
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
            // Create a Types relation to mark this entity as an Image type
            // URL storage is handled by image-node.tsx component
            const imageTypeRelation = getRelationForBlockType(node.id, SystemIds.IMAGE_TYPE, spaceId);
            storage.relations.set(imageTypeRelation);
            break;
          }
          case SystemIds.VIDEO_TYPE: {
            // Create a Types relation to mark this entity as a Video type
            const relation = getRelationForBlockType(node.id, SystemIds.VIDEO_TYPE, spaceId);
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
        deleteBlockEntityData(removedBlockId, spaceId, initialBlockValues, initialBlockEntityRelations);
      }

      makeBlocksRelations({
        nextBlocks: newBlocks,
        addedBlocks: addedBlocks.map(block => ({ id: block.id, value: block.id })),
        removedBlockIds: removed,
        movedBlocks: movedBlocks.map(block => ({ id: block.id, value: block.id })),
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
          case 'image':
            // Image block persistence is handled directly in image-node.tsx component
            // using storage.values.set() for URL and storage.entities.name.set() for title
            break;
          case 'video':
            // Video block persistence is handled directly in video-node.tsx component
            // using storage.entities.name.set() for title
            break;
          default:
            break;
        }
      }
    },
    [blockIds, activeEntityId, spaceId, blockRelations, initialBlockValues, initialBlockEntityRelations]
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
