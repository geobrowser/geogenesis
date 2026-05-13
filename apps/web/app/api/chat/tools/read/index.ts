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

// Members only — research delegates to a sub-agent route that runs Anthropic's
// hosted webSearch. Guests stay read-only against Geo with no live-web access.
export const memberReadTools = {
  research,
};

export type ReadToolName = keyof typeof readTools | keyof typeof memberReadTools;
