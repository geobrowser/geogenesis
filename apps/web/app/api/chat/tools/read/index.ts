import { getEntityTool } from './get-entity';
import { listSpaces } from './list-spaces';
import { searchGraph } from './search-graph';

export const readTools = {
  searchGraph,
  getEntity: getEntityTool,
  listSpaces,
};

export type ReadToolName = keyof typeof readTools;
