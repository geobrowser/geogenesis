import { buildCreateBlockTool, buildDeleteBlockTool, buildUpdateBlockTool } from './blocks';
import { WriteContext, buildWriteContext } from './context';
import { buildCreateEntityTool } from './create-entity';
import { buildCreatePropertyTool } from './create-property';
import {
  buildAddCollectionItemTool,
  buildRemoveCollectionItemTool,
  buildSetDataBlockFiltersTool,
  buildSetDataBlockViewTool,
} from './data-block';
import { buildMoveBlockTool, buildMoveRelationTool } from './reorder';
import { buildDeleteEntityRelationTool, buildSetEntityRelationTool } from './set-entity-relation';
import { buildAddPropertyToEntityTool, buildDeleteEntityValueTool, buildSetEntityValueTool } from './set-entity-value';
import { buildToggleEditModeTool } from './toggle-edit-mode';

export { buildWriteContext };
export type { WriteContext };

export function buildWriteTools(context: WriteContext) {
  return {
    toggleEditMode: buildToggleEditModeTool(context),
    setEntityValue: buildSetEntityValueTool(context),
    deleteEntityValue: buildDeleteEntityValueTool(context),
    addPropertyToEntity: buildAddPropertyToEntityTool(context),
    createProperty: buildCreatePropertyTool(context),
    setEntityRelation: buildSetEntityRelationTool(context),
    deleteEntityRelation: buildDeleteEntityRelationTool(context),
    createEntity: buildCreateEntityTool(context),
    createBlock: buildCreateBlockTool(context),
    updateBlock: buildUpdateBlockTool(context),
    deleteBlock: buildDeleteBlockTool(context),
    moveBlock: buildMoveBlockTool(context),
    moveRelation: buildMoveRelationTool(context),
    setDataBlockFilters: buildSetDataBlockFiltersTool(context),
    setDataBlockView: buildSetDataBlockViewTool(context),
    addCollectionItem: buildAddCollectionItemTool(context),
    removeCollectionItem: buildRemoveCollectionItemTool(context),
  };
}

export type WriteToolName = keyof ReturnType<typeof buildWriteTools>;
