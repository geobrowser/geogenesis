// Types only — safe to import across client/server boundary.
import type { Filter, ModesByColumn } from '~/core/blocks/data/filters';
import type { DataType } from '~/core/types';

export type BlockKind = 'text' | 'code' | 'image' | 'video' | 'data';

export type DataBlockView = 'TABLE' | 'LIST' | 'GALLERY' | 'BULLETED_LIST';

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
      kind: 'createProperty';
      propertyId: string;
      spaceId: string;
      name: string;
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
      modesByColumn: ModesByColumn;
    }
  | {
      kind: 'setDataBlockView';
      blockId: string;
      // The block's parent page. Dispatcher uses this to find the
      // BLOCKS-relation entity that carries the VIEW_PROPERTY edge.
      parentEntityId: string;
      spaceId: string;
      view: DataBlockView;
    }
  | {
      kind: 'createEntity';
      entityId: string;
      spaceId: string;
      name: string;
      description?: string;
      typeIds?: string[];
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
    | 'already_exists';
  spaceId?: string;
  entityId?: string;
  propertyId?: string;
  retryAfter?: number;
  message?: string;
};

export type EditToolOutput = { ok: true; intent: EditIntent } | EditToolFailure;

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
  'setEntityRelation',
  'deleteEntityRelation',
  'createEntity',
  'createBlock',
  'updateBlock',
  'deleteBlock',
  'moveBlock',
  'moveRelation',
  'setDataBlockFilters',
  'setDataBlockView',
  'addCollectionItem',
  'removeCollectionItem',
] as const;

// The AI SDK prefixes part types with 'tool-'.
const EDIT_TOOL_PART_TYPES = new Set(EDIT_TOOL_NAMES.map(name => `tool-${name}`));

export function isEditToolPartType(type: string): boolean {
  return EDIT_TOOL_PART_TYPES.has(type);
}
