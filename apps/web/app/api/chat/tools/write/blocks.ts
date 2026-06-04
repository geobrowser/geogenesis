import { jsonSchema, tool } from 'ai';

import type { DataBlockSource, DataBlockView } from '~/core/chat/edit-types';

import { ENTITY_ID_PATTERN } from './shared';

const BLOCK_KINDS = ['text', 'code', 'image', 'video', 'data'] as const;
const DATA_VIEWS: readonly DataBlockView[] = ['TABLE', 'LIST', 'GALLERY', 'BULLETED_LIST'];
const DATA_SOURCES: readonly DataBlockSource[] = ['COLLECTION', 'QUERY', 'GEO'];

type CreateBlockInput = {
  parentEntityId: string;
  spaceId: string;
  blockKind: (typeof BLOCK_KINDS)[number];
  markdown?: string;
  url?: string;
  title?: string;
  source?: DataBlockSource;
  view?: DataBlockView;
};

export const createBlock = tool({
  description:
    'Add a new block to an entity page. Blocks render in order (`text` / `code` for prose, `image` / `video` for media, `data` for tables/lists). Include `markdown` for text/code, `url` + optional `title` for image/video, or `source` + `view` + `title` for data. Data blocks need a short descriptive `title` ("People", "Reading List") and default to COLLECTION + TABLE. **Text blocks are single-paragraph** — prefer one createBlock call per section. As a safety net, text markdown containing newlines is auto-split into one block per line; code blocks keep newlines intact.',
  inputSchema: jsonSchema<CreateBlockInput>({
    type: 'object',
    properties: {
      parentEntityId: { type: 'string', pattern: ENTITY_ID_PATTERN },
      spaceId: { type: 'string', pattern: ENTITY_ID_PATTERN },
      blockKind: { type: 'string', enum: BLOCK_KINDS as unknown as string[] },
      markdown: { type: 'string', description: 'For text / code blocks.' },
      url: { type: 'string', description: 'For image / video blocks. http/https/ipfs only.' },
      title: {
        type: 'string',
        description: 'Caption for image / video, or header label for data blocks. Recommended for data blocks.',
      },
      source: { type: 'string', enum: DATA_SOURCES as unknown as string[] },
      view: { type: 'string', enum: DATA_VIEWS as unknown as string[] },
    },
    required: ['parentEntityId', 'spaceId', 'blockKind'],
    additionalProperties: false,
  }),
});

type UpdateBlockInput = {
  blockId: string;
  parentEntityId: string;
  spaceId: string;
  blockKind: (typeof BLOCK_KINDS)[number];
  markdown?: string;
  url?: string;
  title?: string;
  source?: DataBlockSource;
  view?: DataBlockView;
};

export const updateBlock = tool({
  description:
    "Update an existing block's content. Pass `blockId` (the block entity id) plus `parentEntityId` (the page / tab entity that holds the block) so we can confirm the block actually belongs to that page — this stops typo'd ids from silently rewriting an unrelated block. For text / code pass `markdown` (text and code blocks are equivalent at the graph level — `getEntity` always returns them as `kind: 'text'`; pass `text` for both unless you specifically want to skip the multi-line auto-split). For image / video pass `url` and optionally `title`. For data blocks you can pass any subset of `title` / `source` — only the fields you pass get written, the rest are preserved (e.g. rename a data block by passing `title` alone, keeping its existing source intact). Use `setDataBlockView` for view changes (passing `view` here is silently ignored) and `setDataBlockFilters` for filters. Use `deleteBlock` to remove and `createBlock` to add.",
  inputSchema: jsonSchema<UpdateBlockInput>({
    type: 'object',
    properties: {
      blockId: { type: 'string', pattern: ENTITY_ID_PATTERN },
      parentEntityId: { type: 'string', pattern: ENTITY_ID_PATTERN },
      spaceId: { type: 'string', pattern: ENTITY_ID_PATTERN },
      blockKind: { type: 'string', enum: BLOCK_KINDS as unknown as string[] },
      markdown: { type: 'string' },
      url: { type: 'string' },
      title: { type: 'string' },
      source: { type: 'string', enum: DATA_SOURCES as unknown as string[] },
      view: { type: 'string', enum: DATA_VIEWS as unknown as string[] },
    },
    required: ['blockId', 'parentEntityId', 'spaceId', 'blockKind'],
    additionalProperties: false,
  }),
});

type DeleteBlockInput = {
  blockId: string;
  parentEntityId: string;
  spaceId: string;
};

export const deleteBlock = tool({
  description:
    "Remove a block from an entity page. Deletes the block entity's values, its relations, and the page-to-block relation.",
  inputSchema: jsonSchema<DeleteBlockInput>({
    type: 'object',
    properties: {
      blockId: { type: 'string', pattern: ENTITY_ID_PATTERN },
      parentEntityId: { type: 'string', pattern: ENTITY_ID_PATTERN },
      spaceId: { type: 'string', pattern: ENTITY_ID_PATTERN },
    },
    required: ['blockId', 'parentEntityId', 'spaceId'],
    additionalProperties: false,
  }),
});
