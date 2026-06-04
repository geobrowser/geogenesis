import { getEntityTool } from './get-entity';
import { getSpaceTypes } from './get-space-types';
import { listSpaces } from './list-spaces';
import { research } from './research';
import { searchGraph } from './search-graph';
import { searchImages } from './search-images';
import { webFetch } from './web-fetch';

export const readTools = {
  searchGraph,
  getEntity: getEntityTool,
  listSpaces,
  getSpaceTypes,
};

// Members only — research, searchImages, and webFetch delegate to their own
// sub-agent routes. research = open-web search ("find me info about X").
// searchImages runs Anthropic's hosted webSearch for image URLs. webFetch
// fetches a specific URL the user pasted, with x.com/twitter.com routed
// through a Twitter-aware path that handles JS-rendered pages.
export const memberReadTools = {
  research,
  searchImages,
  webFetch,
};

export type ReadToolName = keyof typeof readTools | keyof typeof memberReadTools;
