import { getEntityTool } from './get-entity';
import { getSpaceTypes } from './get-space-types';
import { listSpaces } from './list-spaces';
import { research } from './research';
import { searchGraph } from './search-graph';

export const readTools = {
  searchGraph,
  getEntity: getEntityTool,
  listSpaces,
  getSpaceTypes,
};

// Members only — research delegates to the webSearch sub-agent.
export const memberReadTools = {
  research,
};

export type ReadToolName = keyof typeof readTools | keyof typeof memberReadTools;
