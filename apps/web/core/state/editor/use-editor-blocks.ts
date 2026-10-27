'use client';

import { SystemIds } from '@geoprotocol/geo-sdk/lite';
import type { JSONContent } from '@tiptap/core';

import * as React from 'react';

import { useSearchParams } from 'next/navigation';

import { blockMediaFrame } from '~/core/hooks/use-block-media-dimensions';
import { getRelations, getValues, useRelations, useValues } from '~/core/sync/use-store';
import { store } from '~/core/sync/use-sync-engine';
import { getImagePath, getVideoPath, validateEntityId } from '~/core/utils/utils';

import type { ServerBlock } from '~/partials/editor/server-content';

import { dataBlockViewFromRelations } from '../../blocks/data/data-block-view';
import { readBlockPageSizeFromValues } from '../../blocks/data/parse-block-page-size';
import { readBlockMediaDimensions } from '../../blocks/data/read-block-media-dimensions';
import {
  RANKING_DATE_PROPERTY_IDS,
  RANKING_END_PROPERTY_IDS,
  RANKING_START_PROPERTY_IDS,
  resolveRankingDate,
} from '../../blocks/ranking/ranking-block-dates';
import { isRankingBlockEntity, isRankingSetupConfigured } from '../../blocks/ranking/ranking-block-state';
import { useActiveTabIdForEditor, useEditorBlocks, useEditorInstance } from './editor-provider';
import {
  PROFILE_OVERVIEW_TAIL_BLOCK_SENTINEL,
  PROFILE_OVERVIEW_TAIL_PLACEHOLDER_TEXT,
} from './profile-overview-tail-placeholder';

export type ParseMarkdown = (markdown: string) => JSONContent;

/** One block as the page renders it: the static form, and the TipTap nodes it becomes. */
export type EditorBlockModel = {
  server: ServerBlock;
  build: (parse: ParseMarkdown) => JSONContent[];
};

export const useTabId = () => {
  const searchParams = useSearchParams();
  const maybeTabId = searchParams?.get('tabId');

  if (!validateEntityId(maybeTabId)) return null;

  return maybeTabId;
};

export function useEditorStoreLite() {
  return useEditorBlocks();
}

export function useEditorBlockModels() {
  const { id: entityId, spaceId, initialBlocks } = useEditorInstance();

  const tabId = useActiveTabIdForEditor();
  const activeEntityId = tabId ?? entityId;

  const { blockRelations, initialBlockEntities } = useEditorBlocks();

  const blockIds = React.useMemo(() => {
    return blockRelations.map(b => b.block.id);
  }, [blockRelations]);

  const initialBlockValues = React.useMemo(() => {
    return initialBlockEntities.flatMap(b => b.values);
  }, [initialBlockEntities]);

  const initialBlockEntityRelations = React.useMemo(() => {
    return initialBlockEntities.flatMap(b => b.relations);
  }, [initialBlockEntities]);

  // Shown-column property entities are only ever attached to the page's own blocks, never to a
  // tab's, so a tab's data blocks have to look outside their own scope to size their media frame.
  const mediaPropertySource = React.useMemo(
    () => (initialBlockEntities === initialBlocks ? initialBlockEntities : [...initialBlockEntities, ...initialBlocks]),
    [initialBlockEntities, initialBlocks]
  );

  const markdownValues = useValues({
    selector: value => blockIds.includes(value.entity.id) && value.property.id === SystemIds.MARKDOWN_CONTENT,
  });

  const blockConfigValues = useValues({
    selector: value =>
      blockIds.includes(value.entity.id) &&
      value.spaceId === spaceId &&
      (value.property.id === SystemIds.NAME_PROPERTY ||
        value.property.id === SystemIds.FILTER ||
        RANKING_DATE_PROPERTY_IDS.has(value.property.id)),
  });

  const blockTypesRelations = useRelations({
    selector: relation =>
      blockIds.includes(relation.fromEntity.id) &&
      relation.spaceId === spaceId &&
      relation.type.id === SystemIds.TYPES_PROPERTY,
  });

  const blockModels = React.useMemo<EditorBlockModel[]>(() => {
    return blockRelations.map((block): EditorBlockModel => {
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

        const server: ServerBlock = { type: 'image', src: getImagePath(imageUrlValue) };

        const nodes: JSONContent[] = [
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
        return { server, build: () => nodes };
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

        const server: ServerBlock = { type: 'video', src: getVideoPath(videoUrlValue) };

        const nodes: JSONContent[] = [
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
        return { server, build: () => nodes };
      }

      const blockTypeRelations = getRelations({
        mergeWith: initialBlockEntityRelations,
        selector: r =>
          r.fromEntity.id === block.block.id &&
          r.type.id === SystemIds.TYPES_PROPERTY &&
          r.spaceId === spaceId &&
          !r.isDeleted,
      });

      if (isRankingBlockEntity(block.block.id, blockTypeRelations, spaceId)) {
        const server: ServerBlock = { type: 'data' };

        const configuredFilters = getValues({
          mergeWith: initialBlockValues,
          selector: v =>
            v.entity.id === block.block.id &&
            v.property.id === SystemIds.FILTER &&
            v.spaceId === spaceId &&
            v.value.length > 0 &&
            !v.isDeleted,
        });
        const rankingBlockEntity = initialBlockEntities.find(b => b.id === block.block.id);
        const blockName = store.getEntity(block.block.id, { spaceId })?.name ?? rankingBlockEntity?.name;
        const rankingSetupConfigured = isRankingSetupConfigured(block.block.id, blockName, configuredFilters, spaceId);
        const readRankingDate = (propertyId: string) =>
          getValues({
            mergeWith: initialBlockValues,
            selector: v =>
              v.entity.id === block.block.id && v.property.id === propertyId && v.spaceId === spaceId && !v.isDeleted,
          })[0]?.value ?? null;
        const rankingStartDate = resolveRankingDate(RANKING_START_PROPERTY_IDS, readRankingDate) || null;
        const rankingEndDate = resolveRankingDate(RANKING_END_PROPERTY_IDS, readRankingDate) || null;

        const nodes: JSONContent[] = [
          {
            type: 'rankingNode',
            attrs: {
              id: block.block.id,
              relationId: block.relationId,
              spaceId,
              rankingSetupCompleted: rankingSetupConfigured,
              rankingStartDate,
              rankingEndDate,
            },
          },
        ];
        return { server, build: () => nodes };
      }

      if (toEntity?.type === 'DATA') {
        // Shape the pre-hydration placeholder exactly like what's about to replace it: same
        // view, same page size, same card ratio. All three come off the BLOCKS relation entity
        // and the shown-column properties the server sends down with the page, so a gallery
        // block never has to flash a table skeleton or a default-ratio one on its way to cards.
        const blockRelationEntity = initialBlockEntities.find(b => b.id === block.entityId);
        const viewRelations = getRelations({
          mergeWith: initialBlockEntityRelations,
          selector: r =>
            r.fromEntity.id === block.entityId &&
            r.type.id === SystemIds.VIEW_PROPERTY &&
            r.spaceId === spaceId &&
            !r.isDeleted,
        });

        const server: ServerBlock = {
          type: 'data',
          view: dataBlockViewFromRelations(viewRelations),
          pageSize: readBlockPageSizeFromValues(blockRelationEntity?.values, spaceId),
          mediaFrame: blockMediaFrame(readBlockMediaDimensions(block.entityId, mediaPropertySource)),
        };

        const dataSourceType = getRelations({
          mergeWith: initialBlockEntityRelations,
          selector: r =>
            r.fromEntity.id === block.block.id &&
            r.type.id === SystemIds.DATA_SOURCE_TYPE_RELATION_TYPE &&
            r.spaceId === spaceId &&
            !r.isDeleted,
        })[0]?.toEntity.id;
        const isQuerySource =
          dataSourceType === SystemIds.QUERY_DATA_SOURCE || dataSourceType === SystemIds.ALL_OF_GEO_DATA_SOURCE;
        const configuredShownColumns = getRelations({
          mergeWith: initialBlockEntityRelations,
          selector: r =>
            r.fromEntity.id === block.entityId &&
            (r.type.id === SystemIds.PROPERTIES || r.type.id === SystemIds.SHOWN_COLUMNS) &&
            r.spaceId === spaceId &&
            !r.isDeleted,
        });
        const configuredFilters = getValues({
          mergeWith: initialBlockValues,
          selector: v =>
            v.entity.id === block.block.id &&
            v.property.id === SystemIds.FILTER &&
            v.spaceId === spaceId &&
            v.value.length > 0 &&
            !v.isDeleted,
        });

        const initialDataSource = isQuerySource ? ('QUERY' as const) : ('COLLECTION' as const);

        const nodes: JSONContent[] = [
          {
            type: 'tableNode',
            attrs: {
              id: block.block.id,
              relationId: block.relationId,
              spaceId,
              initialDataSource,
              querySetupCompleted: isQuerySource
                ? configuredShownColumns.length > 0 || configuredFilters.length > 0
                : null,
            },
          },
        ];
        return { server, build: () => nodes };
      }

      let markdownStr = markdownValueForBlockId?.value || '';
      const mdTrimmed = markdownStr.trim();
      let restoreTailPlaceholder = false;
      if (mdTrimmed === PROFILE_OVERVIEW_TAIL_PLACEHOLDER_TEXT) {
        restoreTailPlaceholder = true;
        markdownStr = '';
      } else if (mdTrimmed === PROFILE_OVERVIEW_TAIL_BLOCK_SENTINEL) {
        restoreTailPlaceholder = true;
        markdownStr = '';
      }
      const server: ServerBlock = { type: 'text', markdown: markdownStr };

      // Parsing the markdown is what pulls in the editor's schema, so it is deferred to `build`
      // and the read-only render never pays for it.
      const build = (parse: ParseMarkdown): JSONContent[] => {
        const parsed = markdownStr ? parse(markdownStr) : { type: 'doc', content: [] };

        // A single block's markdown can produce multiple Tiptap nodes (e.g. heading + paragraph + list).
        // Return all of them so multi-element content renders fully.
        if (!parsed.content || parsed.content.length === 0) {
          const nodes: JSONContent[] = [
            {
              type: 'paragraph',
              attrs: {
                id: block.block.id,
                relationId: block.relationId,
                spaceId,
                ...(restoreTailPlaceholder ? { tailPlaceholder: true } : {}),
              },
            },
          ];
          return nodes;
        }

        return parsed.content.map((nodeData: JSONContent, index: number) => ({
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
      };

      return { server, build };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    blockRelations,
    initialBlockEntityRelations,
    spaceId,
    initialBlockValues,
    initialBlockEntities,
    mediaPropertySource,
    markdownValues,
    // `blockConfigValues` and `blockTypesRelations` are not read in the body, and are not meant to
    // be: they are store subscriptions, and the helpers this memo calls read that same store. They
    // are here so the editor JSON is rebuilt when block config or types change. Dropping them as
    // "unnecessary" would leave it stale.
    blockConfigValues,
    blockTypesRelations,
  ]);

  return {
    entityId,
    spaceId,
    activeEntityId,
    blockRelations,
    initialBlockEntities,
    blockIds,
    initialBlockValues,
    initialBlockEntityRelations,
    blockModels,
  };
}

/** What the read-only render needs, without the editor's markdown schema. */
export function useEditorServerContent() {
  const { blockModels, blockIds } = useEditorBlockModels();
  const serverBlocks = React.useMemo(() => blockModels.map(m => m.server), [blockModels]);
  return { serverBlocks, blockIds };
}
