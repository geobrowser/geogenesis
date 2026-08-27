import type { Editor, JSONContent } from '@tiptap/react';

import { ID } from '~/core/id';
import type { Relation, Value } from '~/core/types';

export const GEO_BLOCK_CLIPBOARD_MIME = 'application/x-geogenesis-block+json';

const GEO_BLOCK_CLIPBOARD_ATTRIBUTE = 'data-geogenesis-block';
const GEO_BLOCK_CLIPBOARD_STORAGE_KEY = 'geogenesis.copied-block.v1';
const GEO_BLOCK_CLIPBOARD_MAX_AGE_MS = 30 * 60 * 1000;

export type BlockClipboardPayload = {
  version: 1;
  node: JSONContent;
  plainText: string;
  sourceBlockId: string;
  sourceRelationEntityId: string | null;
  values: Value[];
  relations: Relation[];
};

type StoredBlockClipboard = {
  copiedAt: number;
  payload: BlockClipboardPayload;
};

type ClipboardReader = {
  getData: (type: string) => string;
};

/** Writes a portable text fallback plus the Geo block payload used by in-app paste. */
export async function writeBlockClipboard(payload: BlockClipboardPayload): Promise<void> {
  rememberBlockClipboard(payload);

  const clipboard = navigator.clipboard;
  if (typeof ClipboardItem !== 'undefined' && typeof clipboard?.write === 'function') {
    const html = blockClipboardHtml(payload);
    await clipboard.write([
      new ClipboardItem({
        'text/plain': new Blob([payload.plainText], { type: 'text/plain' }),
        'text/html': new Blob([html], { type: 'text/html' }),
      }),
    ]);
    return;
  }

  if (typeof clipboard?.writeText !== 'function') {
    throw new Error('Clipboard access is unavailable');
  }

  await clipboard.writeText(payload.plainText);
}

export function blockClipboardHtml(payload: BlockClipboardPayload): string {
  const encodedPayload = encodeURIComponent(JSON.stringify(payload));
  return `<span ${GEO_BLOCK_CLIPBOARD_ATTRIBUTE}="${encodedPayload}">${escapeHtml(payload.plainText)}</span>`;
}

/** Reads structured Geo content first, then falls back to the recent same-browser copy. */
export function readBlockClipboard(data: ClipboardReader): BlockClipboardPayload | null {
  const customPayload = parseBlockClipboardPayload(data.getData(GEO_BLOCK_CLIPBOARD_MIME));
  if (customPayload) return customPayload;

  const htmlPayload = parseBlockClipboardHtml(data.getData('text/html'));
  if (htmlPayload) return htmlPayload;

  const plainText = data.getData('text/plain');
  return readRememberedBlockClipboard(plainText);
}

export function parseBlockClipboardHtml(html: string): BlockClipboardPayload | null {
  const match = html.match(new RegExp(`${GEO_BLOCK_CLIPBOARD_ATTRIBUTE}="([^"]+)"`));
  if (!match?.[1]) return null;

  try {
    return parseBlockClipboardPayload(decodeURIComponent(match[1]));
  } catch {
    return null;
  }
}

export function parseBlockClipboardPayload(raw: string): BlockClipboardPayload | null {
  if (!raw) return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isBlockClipboardPayload(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function cloneBlockNode(payload: BlockClipboardPayload, spaceId: string, blockId = ID.createEntityId()) {
  const node = JSON.parse(JSON.stringify(payload.node)) as JSONContent;

  node.attrs = {
    ...node.attrs,
    id: blockId,
    relationId: null,
    spaceId,
  };

  return { blockId, node };
}

export function insertClonedBlock(
  editor: Editor,
  payload: BlockClipboardPayload,
  spaceId: string,
  options: { blockId?: string; position?: number } = {}
): string | null {
  const { blockId, node } = cloneBlockNode(payload, spaceId, options.blockId);
  const command = editor.chain();
  const inserted =
    options.position === undefined
      ? command.insertContent(node).focus().scrollIntoView().run()
      : command.insertContentAt(options.position, node).focus().scrollIntoView().run();

  return inserted ? blockId : null;
}

/** Collects the block-owned graph, following relation entities but not shared targets. */
export function collectBlockEntityData({
  rootEntityIds,
  values,
  relations,
}: {
  rootEntityIds: string[];
  values: Value[];
  relations: Relation[];
}): { values: Value[]; relations: Relation[] } {
  const ownedEntityIds = new Set(rootEntityIds);
  const includedRelationKeys = new Set<string>();
  const includedRelations: Relation[] = [];
  let foundRelationEntity = true;

  while (foundRelationEntity) {
    foundRelationEntity = false;

    for (const relation of relations) {
      const relationKey = `${relation.spaceId}:${relation.id}`;
      if (!ownedEntityIds.has(relation.fromEntity.id) || includedRelationKeys.has(relationKey)) continue;

      includedRelationKeys.add(relationKey);
      includedRelations.push(relation);
      if (!ownedEntityIds.has(relation.entityId)) {
        ownedEntityIds.add(relation.entityId);
        foundRelationEntity = true;
      }
    }
  }

  return {
    values: values.filter(value => ownedEntityIds.has(value.entity.id)),
    relations: includedRelations,
  };
}

/**
 * Remaps only the copied block entity and its Blocks-relation entity. Shared
 * schema/property/collection targets remain references to their existing IDs.
 */
export function cloneBlockEntityData({
  payload,
  blockId,
  relationEntityId,
  spaceId,
  createEntityId = ID.createEntityId,
}: {
  payload: BlockClipboardPayload;
  blockId: string;
  relationEntityId: string;
  spaceId: string;
  createEntityId?: () => string;
}): { values: Value[]; relations: Relation[] } {
  const rootEntityIds = [payload.sourceBlockId, payload.sourceRelationEntityId].filter((id): id is string =>
    Boolean(id)
  );
  const copiedData = collectBlockEntityData({
    rootEntityIds,
    values: payload.values,
    relations: payload.relations,
  });
  const copiedEntityIds = new Set(rootEntityIds);
  for (const relation of copiedData.relations) {
    copiedEntityIds.add(relation.fromEntity.id);
    copiedEntityIds.add(relation.entityId);
  }

  const entityIdMap = new Map<string, string>([[payload.sourceBlockId, blockId]]);
  if (payload.sourceRelationEntityId) {
    entityIdMap.set(payload.sourceRelationEntityId, relationEntityId);
  }
  for (const entityId of copiedEntityIds) {
    if (!entityIdMap.has(entityId)) entityIdMap.set(entityId, createEntityId());
  }
  const remapEntityId = (entityId: string) => entityIdMap.get(entityId) ?? entityId;

  const values = copiedData.values.flatMap(value => {
    if (!copiedEntityIds.has(value.entity.id) || value.isDeleted) return [];

    const entityId = remapEntityId(value.entity.id);

    return [
      {
        id: ID.createValueId({ entityId, propertyId: value.property.id, spaceId }),
        entity: {
          ...value.entity,
          id: entityId,
          name: entityId === value.entity.id ? value.entity.name : null,
        },
        property: value.property,
        value: value.value,
        spaceId,
        ...(value.options === undefined ? {} : { options: value.options }),
      },
    ];
  });

  const relations = copiedData.relations.flatMap(relation => {
    if (!copiedEntityIds.has(relation.fromEntity.id) || relation.isDeleted) return [];

    const fromEntityId = remapEntityId(relation.fromEntity.id);
    const toEntityId = remapEntityId(relation.toEntity.id);

    return [
      {
        id: createEntityId(),
        entityId: remapEntityId(relation.entityId),
        type: relation.type,
        fromEntity: {
          ...relation.fromEntity,
          id: fromEntityId,
          name: fromEntityId === relation.fromEntity.id ? relation.fromEntity.name : null,
        },
        toEntity: {
          ...relation.toEntity,
          id: toEntityId,
          name: toEntityId === relation.toEntity.id ? relation.toEntity.name : null,
          value: toEntityId === relation.toEntity.id ? relation.toEntity.value : toEntityId,
        },
        renderableType: relation.renderableType,
        spaceId,
        ...(relation.position === undefined ? {} : { position: relation.position }),
        ...(relation.verified === undefined ? {} : { verified: relation.verified }),
        ...(relation.toSpaceId === undefined ? {} : { toSpaceId: relation.toSpaceId }),
      },
    ];
  });

  return { values, relations };
}

export function buildBlockLink(currentHref: string, blockId: string): string {
  const url = new URL(currentHref);
  url.searchParams.set('source', 'copy_link');
  url.hash = blockId;
  return url.toString();
}

function rememberBlockClipboard(payload: BlockClipboardPayload) {
  if (typeof window === 'undefined') return;

  try {
    const stored: StoredBlockClipboard = { copiedAt: Date.now(), payload };
    window.localStorage.setItem(GEO_BLOCK_CLIPBOARD_STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // Clipboard HTML remains the primary transport when storage is unavailable.
  }
}

function readRememberedBlockClipboard(plainText: string): BlockClipboardPayload | null {
  if (typeof window === 'undefined' || !plainText) return null;

  try {
    const raw = window.localStorage.getItem(GEO_BLOCK_CLIPBOARD_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<StoredBlockClipboard>;
    if (
      typeof parsed.copiedAt !== 'number' ||
      Date.now() - parsed.copiedAt > GEO_BLOCK_CLIPBOARD_MAX_AGE_MS ||
      !isBlockClipboardPayload(parsed.payload) ||
      parsed.payload.plainText !== plainText
    ) {
      return null;
    }

    return parsed.payload;
  } catch {
    return null;
  }
}

function isBlockClipboardPayload(value: unknown): value is BlockClipboardPayload {
  if (!value || typeof value !== 'object') return false;

  const payload = value as Partial<BlockClipboardPayload>;
  return (
    payload.version === 1 &&
    typeof payload.sourceBlockId === 'string' &&
    (payload.sourceRelationEntityId === null || typeof payload.sourceRelationEntityId === 'string') &&
    typeof payload.plainText === 'string' &&
    Boolean(payload.node && typeof payload.node === 'object' && typeof payload.node.type === 'string') &&
    Array.isArray(payload.values) &&
    Array.isArray(payload.relations)
  );
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, character => {
    switch (character) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      case "'":
        return '&#39;';
      default:
        return character;
    }
  });
}
