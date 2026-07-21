// Types only — safe to import across client/server boundary.
import type { Filter, FilterMode } from '~/core/blocks/data/filters';
import type { DataType } from '~/core/types';

export type BlockKind = 'text' | 'code' | 'image' | 'video' | 'data';

export type DataBlockView = 'TABLE' | 'LIST' | 'GALLERY' | 'BULLETED_LIST' | 'EXPLORE' | 'PILL';

export type DataBlockSource = 'COLLECTION' | 'QUERY' | 'GEO';

export type BlockContent =
  | { kind: 'text' | 'code'; markdown: string }
  | { kind: 'image' | 'video'; url: string; title?: string | null }
  // source/view/title are all optional so `updateBlock` can carry a partial
  // update (just the title, just the source, etc.) without the dispatcher
  // having to re-derive the existing fields. `createBlock` applies defaults
  // in the dispatcher when they're missing.
  | { kind: 'data'; source?: DataBlockSource; view?: DataBlockView; title?: string | null };

export type EditIntent =
  | { kind: 'toggleEditMode'; mode: 'browse' | 'edit' }
  | {
      kind: 'setValue';
      entityId: string;
      spaceId: string;
      propertyId: string;
      propertyName: string;
      dataType: DataType;
      value: string;
      entityName?: string | null;
    }
  | {
      kind: 'deleteValue';
      entityId: string;
      spaceId: string;
      propertyId: string;
    }
  | {
      kind: 'setRelation';
      fromEntityId: string;
      fromEntityName?: string | null;
      spaceId: string;
      typeId: string;
      typeName: string | null;
      toEntityId: string;
      toEntityName: string | null;
    }
  | {
      kind: 'deleteRelation';
      fromEntityId: string;
      spaceId: string;
      typeId: string;
      toEntityId: string;
    }
  | {
      kind: 'setEntityImage';
      entityId: string;
      entityName: string | null;
      spaceId: string;
      propertyId: string;
      propertyName: string | null;
      sourceUrl: string;
    }
  | {
      kind: 'createProperty';
      propertyId: string;
      spaceId: string;
      name: string;
      dataType: DataType;
      renderableTypeId: string | null;
    }
  | {
      kind: 'deleteProperty';
      propertyId: string;
      spaceId: string;
    }
  | {
      kind: 'changePropertyDataType';
      propertyId: string;
      spaceId: string;
      propertyName: string;
      // Resolved by the planner via mapPropertyType; the dispatcher writes
      // these into the new DATA_TYPE_PROPERTY / RENDERABLE_TYPE_PROPERTY edges.
      dataType: DataType;
      renderableTypeId: string | null;
    }
  | {
      kind: 'createBlock';
      parentEntityId: string;
      spaceId: string;
      blockId: string;
      content: BlockContent;
    }
  // Multi-block create — applied in array order with sequential positions.
  // Used by createBlock auto-split when text markdown contains newlines.
  | {
      kind: 'createBlocks';
      parentEntityId: string;
      spaceId: string;
      blocks: Array<{ blockId: string; content: BlockContent }>;
    }
  | {
      kind: 'updateBlock';
      blockId: string;
      spaceId: string;
      content: BlockContent;
    }
  | {
      kind: 'deleteBlock';
      blockId: string;
      parentEntityId: string;
      spaceId: string;
    }
  | {
      kind: 'setDataBlockFilters';
      blockId: string;
      spaceId: string;
      filters: Filter[];
      mode: FilterMode;
    }
  | {
      kind: 'setDataBlockView';
      blockId: string;
      // The block's parent page.
      parentEntityId: string;
      spaceId: string;
      view: DataBlockView;
    }
  | {
      kind: 'setDataBlockShownColumns';
      blockId: string;
      // The block's parent page.
      parentEntityId: string;
      spaceId: string;
      // Full ordered list of property ids to show. Replaces existing columns.
      propertyIds: string[];
    }
  | {
      kind: 'createEntity';
      entityId: string;
      spaceId: string;
      name: string;
      description?: string;
      typeIds?: string[];
    }
  | {
      kind: 'deleteEntity';
      entityId: string;
      spaceId: string;
    }
  | {
      kind: 'moveEntityToSpace';
      entityId: string;
      // Source space the entity is moving out of.
      spaceId: string;
      targetSpaceId: string;
    }
  | {
      kind: 'cloneEntityToSpace';
      entityId: string;
      spaceId: string;
      targetSpaceId: string;
    }
  | {
      kind: 'createTab';
      parentEntityId: string;
      spaceId: string;
      // Minted client-side in the planner so the model can address the tab
      // in the same turn it was created.
      tabId: string;
      name: string;
    }
  | {
      kind: 'renameTab';
      tabId: string;
      spaceId: string;
      name: string;
    }
  // Reorder primitives: both use RelativePosition so the dispatcher's
  // position-computation helper covers both.
  | {
      kind: 'moveBlock';
      blockId: string;
      parentEntityId: string;
      spaceId: string;
      position: RelativePosition;
    }
  | {
      kind: 'moveRelation';
      fromEntityId: string;
      typeId: string;
      toEntityId: string;
      spaceId: string;
      position: RelativePosition;
    };

export type RelativePosition =
  | { kind: 'first' }
  | { kind: 'last' }
  | { kind: 'before'; referenceId: string }
  | { kind: 'after'; referenceId: string };

export type EditToolFailure = {
  ok: false;
  error:
    | 'not_signed_in'
    | 'not_authorized'
    | 'invalid_input'
    | 'not_found'
    | 'wrong_type'
    | 'rate_limited'
    | 'lookup_failed'
    | 'already_exists'
    | 'apply_failed';
  spaceId?: string;
  entityId?: string;
  propertyId?: string;
  retryAfter?: number;
  message?: string;
};

export type EditToolOutput = { ok: true; intent: EditIntent } | EditToolFailure;

// Failure-shape factories. Lifted here so both the server (the auth endpoint)
// and the client (write-validators / edit-dispatcher) emit identical shapes.
export function invalid(message?: string): EditToolFailure {
  return { ok: false, error: 'invalid_input', message };
}

export function notSignedIn(): EditToolFailure {
  return { ok: false, error: 'not_signed_in' };
}

export function notAuthorized(spaceId: string): EditToolFailure {
  return { ok: false, error: 'not_authorized', spaceId };
}

export function notFound(kind: 'entity' | 'property' | 'space', id: string, message?: string): EditToolFailure {
  return {
    ok: false,
    error: 'not_found',
    message: message ?? `${kind} ${id} not found`,
    ...(kind === 'entity' ? { entityId: id } : {}),
    ...(kind === 'property' ? { propertyId: id } : {}),
    ...(kind === 'space' ? { spaceId: id } : {}),
  };
}

export function wrongType(message: string): EditToolFailure {
  return { ok: false, error: 'wrong_type', message };
}

export function alreadyExists(message?: string): EditToolFailure {
  return { ok: false, error: 'already_exists', message };
}

export function rateLimited(retryAfter: number): EditToolFailure {
  return { ok: false, error: 'rate_limited', retryAfter };
}

export function lookupFailed(): EditToolFailure {
  return { ok: false, error: 'lookup_failed' };
}

export type ApplyResult = { ok: true } | { ok: false; error: 'apply_failed'; message?: string };

export function applyFailed(message?: string): Extract<ApplyResult, { ok: false }> {
  return { ok: false, error: 'apply_failed', message };
}

// Names of the actual write tools registered with the AI SDK. Note that
// `createBlocks` is intentionally NOT here even though `EditIntent` has a
// `createBlocks` arm — that intent is only emitted by the `createBlock` tool
// when text markdown contains newlines, never by a tool of that name. The
// dispatcher's switch handles both arms; the part type stays `tool-createBlock`.
export const EDIT_TOOL_NAMES = [
  'toggleEditMode',
  'setEntityValue',
  'deleteEntityValue',
  'addPropertyToEntity',
  'createProperty',
  'deleteProperty',
  'changePropertyDataType',
  'setEntityRelation',
  'deleteEntityRelation',
  'setEntityImage',
  'createEntity',
  'deleteEntity',
  'moveEntityToSpace',
  'cloneEntityToSpace',
  'createTab',
  'renameTab',
  'createBlock',
  'updateBlock',
  'deleteBlock',
  'moveBlock',
  'moveRelation',
  'setDataBlockFilters',
  'setDataBlockView',
  'setDataBlockShownColumns',
  'addCollectionItem',
  'removeCollectionItem',
] as const;

// The AI SDK prefixes part types with 'tool-'.
const EDIT_TOOL_PART_TYPES = new Set(EDIT_TOOL_NAMES.map(name => `tool-${name}`));

export function isEditToolPartType(type: string): boolean {
  return EDIT_TOOL_PART_TYPES.has(type);
}
