import { applyImport } from './apply-import';
import { createBlock, deleteBlock, updateBlock } from './blocks';
import { changePropertyDataType } from './change-property-data-type';
import { WriteContext, buildWriteContext } from './context';
import { createEntity } from './create-entity';
import { createProperty } from './create-property';
import {
  addCollectionItem,
  removeCollectionItem,
  setDataBlockFilters,
  setDataBlockShownColumns,
  setDataBlockView,
} from './data-block';
import { deleteEntity } from './delete-entity';
import { deleteProperty } from './delete-property';
import { cloneEntityToSpace, moveEntityToSpace } from './move-entity-to-space';
import { moveBlock, moveRelation } from './reorder';
import { setEntityImage } from './set-entity-image';
import { deleteEntityRelation, setEntityRelation } from './set-entity-relation';
import { addPropertyToEntity, deleteEntityValue, setEntityValue } from './set-entity-value';
import { createTab, renameTab } from './tabs';
import { toggleEditMode } from './toggle-edit-mode';

export { buildWriteContext };
export type { WriteContext };

// Schema-only tools. Authorization (member + edit rate limit) lives in
// /api/chat/authorize-write; graph-state validation + intent generation runs
// in the client dispatcher (core/chat/edit-dispatcher.ts via planWriteTool).
export const writeTools = {
  toggleEditMode,
  setEntityValue,
  deleteEntityValue,
  addPropertyToEntity,
  createProperty,
  deleteProperty,
  changePropertyDataType,
  setEntityRelation,
  deleteEntityRelation,
  setEntityImage,
  createEntity,
  deleteEntity,
  moveEntityToSpace,
  cloneEntityToSpace,
  createTab,
  renameTab,
  createBlock,
  updateBlock,
  deleteBlock,
  moveBlock,
  moveRelation,
  setDataBlockFilters,
  setDataBlockView,
  setDataBlockShownColumns,
  addCollectionItem,
  removeCollectionItem,
  // Client-dispatched, but by core/chat/import-dispatcher rather than
  // edit-dispatcher — it runs the import engine instead of planning an intent.
  // Deliberately absent from EDIT_TOOL_NAMES so only one dispatcher answers it.
  applyImport,
};

export type WriteToolName = keyof typeof writeTools;
