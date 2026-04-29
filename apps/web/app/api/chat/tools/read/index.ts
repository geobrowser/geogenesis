import { getEntityTool } from './get-entity';
import { getSpaceTypes } from './get-space-types';
import { listSpaces } from './list-spaces';
import { searchGraph } from './search-graph';

export const readTools = {
  searchGraph,
  getEntity: getEntityTool,
  listSpaces,
  getSpaceTypes,
};

export type ReadToolName = keyof typeof readTools;
