'use client';

import { SYSTEM_IDS } from '@geogenesis/ids';
import { A, pipe } from '@mobily/ts-belt';
import { Editor } from '@tiptap/core';
import { JSONContent, generateHTML, generateJSON } from '@tiptap/react';
import pluralize from 'pluralize';
import Showdown from 'showdown';

import * as React from 'react';

import { tiptapExtensions } from '~/partials/editor/editor';
import { htmlToPlainText } from '~/partials/editor/editor-utils';

import { TableBlockSdk } from '../blocks-sdk';
import { useActionsStore } from '../hooks/use-actions-store';
import { ID } from '../id';
import { Services } from '../services';
import { EntityValue, Triple as ITriple, OmitStrict } from '../types';
import { Action } from '../utils/action';
import { Triple } from '../utils/triple';
import { getImagePath } from '../utils/utils';
import { Value } from '../utils/value';
import { useEntityPageStore } from './entity-page-store/entity-store';

const markdownConverter = new Showdown.Converter();

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
  const { id: entityId, spaceId, initialBlockIdsTriple, initialBlockTriples } = useEditorInstance();
  const { subgraph } = Services.useServices();
  const { create, update, remove, allActions } = useActionsStore();
  const { name } = useEntityPageStore();

  const blockIdsTriple = React.useMemo(() => {
    const entityChanges = Triple.fromActions(
      Action.forEntityId(allActions, entityId),
      initialBlockIdsTriple ? [initialBlockIdsTriple] : []
    );
    const blocksIdTriple: ITriple | undefined = entityChanges.find(t => t.attributeId === SYSTEM_IDS.BLOCKS);

    // Favor the local version of the blockIdsTriple if it exists
    return blocksIdTriple ?? initialBlockIdsTriple ?? null;
  }, [allActions, entityId, initialBlockIdsTriple]);

  const blockIds = React.useMemo(() => {
    return blockIdsTriple ? (JSON.parse(Value.stringValue(blockIdsTriple) || '[]') as string[]) : [];
  }, [blockIdsTriple]);

  const blockTriples = React.useMemo(() => {
    return pipe(
      allActions,
      actions => Triple.fromActions(actions, initialBlockTriples),
      A.filter(t => blockIds.includes(t.entityId)),
      triples =>
        // We may be referencing attributes/entities from other spaces whose name has changed.
        // We pass _all_ local changes instead of just the current space changes.
        Triple.withLocalNames(allActions, triples)
    );
  }, [allActions, blockIds, initialBlockTriples]);

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
        create(
          Triple.withId({
            space: spaceId,
            entityId: blockEntityId,
            entityName: entityName,
            attributeId: SYSTEM_IDS.TYPES,
            attributeName: 'Types',
            value: blockTypeValue,
          })
        );
      }
    },
    [create, getBlockTriple, spaceId]
  );

  // Helper function for upserting a new block name triple for TABLE_BLOCK, TEXT_BLOCK, or IMAGE_BLOCK
  const upsertBlockNameTriple = React.useCallback(
    (node: JSONContent) => {
      const blockEntityId = getNodeId(node);
      const entityName = getNodeName(node);

      const existingBlockTriple = getBlockTriple({ entityId: blockEntityId, attributeId: SYSTEM_IDS.NAME });
      const isUpdated = existingBlockTriple && Value.stringValue(existingBlockTriple) !== entityName;
      const isTableNode = node.type === 'tableNode';

      if (!existingBlockTriple) {
        create(
          Triple.withId({
            space: spaceId,
            entityId: blockEntityId,
            entityName: entityName,
            attributeId: SYSTEM_IDS.NAME,
            attributeName: 'Name',
            value: { id: ID.createValueId(), type: 'string', value: entityName },
          })
        );
      } else if (!isTableNode && isUpdated) {
        update(
          Triple.ensureStableId({
            ...existingBlockTriple,
            entityName,
            value: { ...existingBlockTriple.value, type: 'string', value: entityName },
          }),
          existingBlockTriple
        );
      }
    },
    [create, getBlockTriple, spaceId, update]
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

      const triple = Triple.withId({
        space: spaceId,
        entityId: blockEntityId,
        entityName: entityName,
        attributeId: SYSTEM_IDS.MARKDOWN_CONTENT,
        attributeName: 'Markdown Content',
        value: { id: ID.createValueId(), type: 'string', value: markdown },
      });

      const existingBlockTriple = getBlockTriple(triple);
      const isUpdated = existingBlockTriple && Value.stringValue(existingBlockTriple) !== markdown;

      if (!existingBlockTriple) {
        create(
          Triple.withId({
            space: spaceId,
            entityId: blockEntityId,
            entityName: entityName,
            attributeId: SYSTEM_IDS.MARKDOWN_CONTENT,
            attributeName: 'Markdown Content',
            value: { id: ID.createValueId(), type: 'string', value: markdown },
          })
        );
      } else if (isUpdated) {
        update(
          Triple.ensureStableId({
            ...existingBlockTriple,
            value: { ...existingBlockTriple.value, type: 'string', value: markdown },
          }),
          existingBlockTriple
        );
      }
    },
    [create, getBlockTriple, spaceId, update]
  );

  // Helper function for creating backlinks to the parent entity
  const createParentEntityTriple = React.useCallback(
    (node: JSONContent) => {
      const blockEntityId = getNodeId(node);

      const existingBlockTriple = getBlockTriple({ entityId: blockEntityId, attributeId: SYSTEM_IDS.PARENT_ENTITY });

      if (!existingBlockTriple) {
        create(
          Triple.withId({
            space: spaceId,
            entityId: blockEntityId,
            entityName: getNodeName(node),
            attributeId: SYSTEM_IDS.PARENT_ENTITY,
            attributeName: 'Parent Entity',
            value: { id: entityId, type: 'entity', name },
          })
        );
      }
    },
    [create, getBlockTriple, entityId, name, spaceId]
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
        create(
          Triple.withId({
            space: spaceId,
            entityId: blockEntityId,
            entityName: getNodeName(node),
            attributeId: SYSTEM_IDS.ROW_TYPE,
            attributeName: 'Row Type',
            value: { id: rowTypeEntityId, type: 'entity', name: rowTypeEntityName },
          })
        );

        // Make sure that we only add it for new tables by also checking that the row type triple doesn't exist.
        // Typically the row type triple only gets added when the table is created. Otherwise this will create
        // a new filter for every table block that doesn't have one every time the content of the editor is changed.
        // Generally the filter triple _also_ won't exist if the row type doesn't, but we check to be safe.
        const existingFilterTriple = getBlockTriple({ entityId: blockEntityId, attributeId: SYSTEM_IDS.FILTER });

        if (!existingFilterTriple) {
          create(
            Triple.withId({
              space: spaceId,
              entityId: blockEntityId,
              entityName: getNodeName(node),
              attributeId: SYSTEM_IDS.FILTER,
              attributeName: 'Filter',
              value: {
                id: ID.createValueId(),
                type: 'string',
                value: TableBlockSdk.createGraphQLStringFromFiltersV2(
                  [
                    {
                      columnId: SYSTEM_IDS.SPACE,
                      valueType: 'string',
                      value: spaceId,
                    },
                  ],
                  rowTypeEntityId
                ),
              },
            })
          );
        }
      }
    },
    [create, getBlockTriple, spaceId]
  );

  // Helper function for creating a new block image triple for IMAGE_BLOCKs only
  const createBlockImageTriple = React.useCallback(
    (node: JSONContent) => {
      const blockEntityId = getNodeId(node);
      const isImageNode = node.type === 'image';

      if (!isImageNode || !node.attrs?.src) {
        return null;
      }

      const { src } = node.attrs;

      create(
        Triple.withId({
          space: spaceId,
          entityId: blockEntityId,
          entityName: getNodeName(node),
          attributeId: SYSTEM_IDS.IMAGE_ATTRIBUTE,
          attributeName: 'Image',
          value: { id: ID.createValueId(), type: 'image', value: Value.toImageValue(src) },
        })
      );
    },
    [create, spaceId]
  );

  // Helper function to create or update the block IDs on an entity
  // Since we don't currently support array value types, we store all ordered blocks as a single stringified array
  const upsertBlocksTriple = React.useCallback(
    async (newBlockIds: string[]) => {
      const existingBlockTriple = blockIdsTriple;
      const isUpdated = existingBlockTriple && Value.stringValue(existingBlockTriple) !== JSON.stringify(newBlockIds);

      if (!existingBlockTriple) {
        const triple = Triple.withId({
          space: spaceId,
          entityId: entityId,
          entityName: name,
          attributeId: SYSTEM_IDS.BLOCKS,
          attributeName: 'Blocks',
          value: {
            id: ID.createValueId(),
            type: 'string',
            value: JSON.stringify(newBlockIds),
          },
        });

        return create(triple);
      }

      if (!isUpdated) return;

      // If a block is deleted we want to make sure that we delete the block entity as well.
      // The block entity might exist remotely, so we need to fetch all the triple associated
      // with that block entity in order to delete them all.
      //
      // Additionally,there may be local triples associated with the block entity that we need
      // to delete.
      const prevBlockIds = blockIds;

      // Returns the blockIds that exist in prevBlockIds, but do not exist in newBlockIds
      const removedBlockIds = A.difference(prevBlockIds, newBlockIds);

      // Fetch all the subgraph data for all the deleted block entities.
      const maybeRemoteBlocks = await Promise.all(
        removedBlockIds.map(async blockId => subgraph.fetchEntity({ id: blockId }))
      );
      const remoteBlocks = maybeRemoteBlocks.flatMap(block => (block ? [block] : []));

      // To delete an entity we delete all of its triples
      remoteBlocks.forEach(block => {
        block.triples.forEach(t => remove(t));
      });

      // Delete any local triples associated with the deleted block entities
      const localTriplesForDeletedBlocks = pipe(
        allActions,
        actions => Triple.fromActions(actions, []),
        triples => triples.filter(t => removedBlockIds.includes(t.entityId))
      );

      localTriplesForDeletedBlocks.forEach(t => remove(t));

      // We delete the existingBlockTriple if the page content is completely empty
      if (newBlockIds.length === 0) {
        return remove(existingBlockTriple);
      }

      const updatedTriple = Triple.ensureStableId({
        ...existingBlockTriple,
        value: {
          ...existingBlockTriple.value,
          type: 'string',
          value: JSON.stringify(newBlockIds),
        },
      });

      return update(updatedTriple, existingBlockTriple);
    },
    [allActions, blockIds, blockIdsTriple, create, entityId, name, remove, subgraph, update, spaceId]
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

      const blockIds = populatedContent.map(node => getNodeId(node));

      upsertBlocksTriple(blockIds);

      populatedContent.forEach(node => {
        createParentEntityTriple(node);
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
      createParentEntityTriple,
      createTableBlockMetadata,
      upsertBlocksTriple,
      upsertBlockMarkdownTriple,
      upsertBlockNameTriple,
    ]
  );

  return {
    blockIds,
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
      return { id: SYSTEM_IDS.TEXT_BLOCK, type: 'entity', name: 'Text Block' };
    case 'image':
      return { id: SYSTEM_IDS.IMAGE_BLOCK, type: 'entity', name: 'Image Block' };
    case 'tableNode':
      return { id: SYSTEM_IDS.TABLE_BLOCK, type: 'entity', name: 'Table Block' };
    default:
      return { id: SYSTEM_IDS.TEXT_BLOCK, type: 'entity', name: 'Text Block' };
  }
};

const EditorContext = React.createContext<OmitStrict<Props, 'children'> | null>(null);

interface Props {
  id: string;
  spaceId: string;
  initialBlockIdsTriple: ITriple | null;
  initialBlockTriples: ITriple[];
  children: React.ReactNode;
}

export const EditorProvider = ({ id, spaceId, initialBlockIdsTriple, initialBlockTriples, children }: Props) => {
  const value = React.useMemo(() => {
    return {
      id,
      spaceId,
      initialBlockIdsTriple,
      initialBlockTriples,
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
