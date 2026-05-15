import { getEntityTool } from './get-entity';
import { getSpaceTypes } from './get-space-types';
import { listSpaces } from './list-spaces';
import { research } from './research';
import { searchGraph } from './search-graph';
import { webFetch } from './web-fetch';

export const readTools = {
  searchGraph,
  getEntity: getEntityTool,
  listSpaces,
  getSpaceTypes,
};

// Members only — research and webFetch each delegate to their own sub-agent.
// research = open-web search ("find me info about X").
// webFetch = fetch a specific URL the user pasted, with x.com/twitter.com
// routed through a Twitter-aware path that handles JS-rendered pages.
export const memberReadTools = {
  research,
  webFetch,
};

export type ReadToolName = keyof typeof readTools | keyof typeof memberReadTools;
