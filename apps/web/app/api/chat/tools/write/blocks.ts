import { IdUtils } from '@geoprotocol/geo-sdk/lite';

import { jsonSchema, tool } from 'ai';

import type { BlockContent, DataBlockSource, DataBlockView, EditToolOutput } from '~/core/chat/edit-types';

import type { WriteContext } from './context';
import {
  ENTITY_ID_PATTERN,
  invalid,
  isEntityId,
  normalizeEntityId,
  notAuthorized,
  resolveBlocksEdge,
  writePrecheck,
} from './shared';

const BLOCK_KINDS = ['text', 'code', 'image', 'video', 'data'] as const;
const DATA_VIEWS: readonly DataBlockView[] = ['TABLE', 'LIST', 'GALLERY', 'BULLETED_LIST'];
const DATA_SOURCES: readonly DataBlockSource[] = ['COLLECTION', 'QUERY', 'GEO'];

const MAX_MARKDOWN_CHARS = 20_000;
const MAX_URL_CHARS = 2_048;
// One createBlock call mints up to this many blocks via auto-split. A 20kB
// markdown of one-char lines could otherwise stage thousands of blocks
// against a single rate-limit token.
const MAX_AUTO_SPLIT_LINES = 30;

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

function buildContent(input: CreateBlockInput): BlockContent | { error: string } {
  switch (input.blockKind) {
    case 'text':
    case 'code': {
      const markdown = input.markdown ?? '';
      if (markdown.length > MAX_MARKDOWN_CHARS) return { error: 'markdown too long' };
      return { kind: input.blockKind, markdown };
    }
    case 'image':
    case 'video': {
      if (!input.url) return { error: 'url is required for image / video blocks' };
      if (input.url.length > MAX_URL_CHARS) return { error: 'url too long' };
      if (input.url.startsWith('data:')) return { error: 'data URIs are not allowed' };
      try {
        const parsed = new URL(input.url);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:' && parsed.protocol !== 'ipfs:') {
          return { error: 'url must be http/https/ipfs' };
        }
      } catch {
        return { error: 'url is not a valid URL' };
      }
      return { kind: input.blockKind, url: input.url, title: input.title ?? null };
    }
    case 'data': {
      if (input.source !== undefined && !DATA_SOURCES.includes(input.source)) return { error: 'invalid source' };
      if (input.view !== undefined && !DATA_VIEWS.includes(input.view)) return { error: 'invalid view' };
      const title = input.title?.trim();
      // Omit unset fields so the dispatcher can distinguish "absent" from
      // "explicitly cleared".
      return {
        kind: 'data',
        ...(input.source !== undefined ? { source: input.source } : {}),
        ...(input.view !== undefined ? { view: input.view } : {}),
        ...(title && title.length > 0 ? { title } : {}),
      };
    }
    default:
      return { error: 'unknown blockKind' };
  }
}

export function buildCreateBlockTool(context: WriteContext) {
  return tool({
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
    execute: async (input: CreateBlockInput): Promise<EditToolOutput> => {
      const gate = await writePrecheck(context);
      if (gate) return gate;
      if (!isEntityId(input.parentEntityId) || !isEntityId(input.spaceId)) return invalid();

      const parentEntityId = normalizeEntityId(input.parentEntityId);
      const spaceId = normalizeEntityId(input.spaceId);

      if (!(await context.isMember(spaceId))) return notAuthorized(spaceId);

      if (input.blockKind === 'text' && input.markdown && /\n/.test(input.markdown)) {
        const lines = input.markdown
          .split(/\n+/)
          .map(s => s.trim())
          .filter(s => s.length > 0);
        if (lines.length > 1) {
          if (lines.length > MAX_AUTO_SPLIT_LINES) {
            return invalid(
              `too many lines; split into multiple createBlock calls (max ${MAX_AUTO_SPLIT_LINES} per call)`
            );
          }
          if (lines.some(l => l.length > MAX_MARKDOWN_CHARS)) return invalid('markdown too long');
          const blocks = lines.map(markdown => {
            const blockId = IdUtils.generate();
            context.mintedBlockIds.add(blockId);
            return { blockId, content: { kind: 'text' as const, markdown } };
          });
          return {
            ok: true,
            intent: { kind: 'createBlocks', parentEntityId, spaceId, blocks },
          };
        }
      }

      const content = buildContent(input);
      if ('error' in content) return invalid(content.error);

      const blockId = IdUtils.generate();
      // Same-turn follow-up intents skip the live-graph BLOCKS-edge check —
      // the edge is only staged client-side until publish.
      context.mintedBlockIds.add(blockId);

      return {
        ok: true,
        intent: {
          kind: 'createBlock',
          parentEntityId,
          spaceId,
          blockId,
          content,
        },
      };
    },
  });
}

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

export function buildUpdateBlockTool(context: WriteContext) {
  return tool({
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
    execute: async (input: UpdateBlockInput): Promise<EditToolOutput> => {
      const gate = await writePrecheck(context);
      if (gate) return gate;
      if (!isEntityId(input.blockId) || !isEntityId(input.parentEntityId) || !isEntityId(input.spaceId)) {
        return invalid();
      }

      const blockId = normalizeEntityId(input.blockId);
      const parentEntityId = normalizeEntityId(input.parentEntityId);
      const spaceId = normalizeEntityId(input.spaceId);

      if (!(await context.isMember(spaceId))) return notAuthorized(spaceId);

      const edgeGate = await resolveBlocksEdge(context, parentEntityId, blockId, spaceId);
      if (edgeGate) return edgeGate;

      // view belongs to setDataBlockView — VIEW_PROPERTY hangs off the
      // BLOCKS-relation entity, not the block.
      if (input.view !== undefined) {
        return invalid('updateBlock cannot change view; call setDataBlockView instead');
      }

      const content = buildContent({
        parentEntityId: blockId,
        spaceId,
        blockKind: input.blockKind,
        markdown: input.markdown,
        url: input.url,
        title: input.title,
        source: input.source,
      });
      if ('error' in content) return invalid(content.error);

      return {
        ok: true,
        intent: { kind: 'updateBlock', blockId, spaceId, content },
      };
    },
  });
}

type DeleteBlockInput = {
  blockId: string;
  parentEntityId: string;
  spaceId: string;
};

export function buildDeleteBlockTool(context: WriteContext) {
  return tool({
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
    execute: async (input: DeleteBlockInput): Promise<EditToolOutput> => {
      const gate = await writePrecheck(context);
      if (gate) return gate;
      if (!isEntityId(input.blockId) || !isEntityId(input.parentEntityId) || !isEntityId(input.spaceId)) {
        return invalid();
      }

      const blockId = normalizeEntityId(input.blockId);
      const parentEntityId = normalizeEntityId(input.parentEntityId);
      const spaceId = normalizeEntityId(input.spaceId);

      if (!(await context.isMember(spaceId))) return notAuthorized(spaceId);

      const edgeGate = await resolveBlocksEdge(context, parentEntityId, blockId, spaceId);
      if (edgeGate) return edgeGate;

      return { ok: true, intent: { kind: 'deleteBlock', blockId, parentEntityId, spaceId } };
    },
  });
}
