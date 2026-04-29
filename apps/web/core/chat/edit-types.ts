// Edit-mode tool shapes shared between the API route (producer) and the chat
// widget (consumer). Types only — no runtime code — so importing across the
// client/server boundary is safe.
import type { Filter, FilterMode } from '~/core/blocks/data/filters';
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
      mode: FilterMode;
    }
  | {
      kind: 'setDataBlockView';
      blockId: string;
      // The page or tab that holds the block. The dispatcher reads this entity's
      // merged (local + remote) BLOCKS relations to find the block-relation
      // entity — the one that actually carries the VIEW_PROPERTY edge. Doing
      // the lookup on the client lets view changes work on freshly-staged
      // blocks whose BLOCKS relation isn't in the live graph yet.
      parentEntityId: string;
      spaceId: string;
      view: DataBlockView;
    }
  | {
      kind: 'createEntity';
      entityId: string; // server-minted new entity id
      spaceId: string;
      name: string;
      description?: string;
      typeIds?: string[];
    }
  // Reorder primitives: share `RelativePosition` so the client dispatcher can
  // handle blocks and arbitrary relations with the same position-computation
  // helper. The dispatcher updates the existing relation's `position` field
  // upserting by relation id, so block-relation entity ids (and the VIEW /
  // filter relations hanging off them) are preserved.
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
  // Optional context fields populated by individual tools.
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

// The AI SDK prefixes tool-part types with 'tool-'. The dispatcher uses this
// set to decide whether a part represents a write tool worth applying.
const EDIT_TOOL_PART_TYPES = new Set(EDIT_TOOL_NAMES.map(name => `tool-${name}`));

export function isEditToolPartType(type: string): boolean {
  return EDIT_TOOL_PART_TYPES.has(type);
}
