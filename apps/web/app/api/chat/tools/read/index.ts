import { geoQuery } from './geo-query';
import { getEntityTool } from './get-entity';
import { getSpaceTypes } from './get-space-types';
import { listSpaces } from './list-spaces';
import { proposeImportMapping } from './propose-import-mapping';
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

// Members only — each delegates to its own sub-agent route. research =
// open-web search ("find me info about X"). searchImages runs Anthropic's
// hosted webSearch for image URLs. webFetch fetches a specific URL the user
// pasted, with x.com/twitter.com routed through a Twitter-aware path that
// handles JS-rendered pages. geoQuery answers read questions about the Geo
// graph that the fixed-shape tools above can't — counts, date ranges, more
// than 10 results, relation traversal, block contents. proposeImportMapping
// maps an uploaded CSV/XLSX onto the space's ontology — a read, despite the
// import framing: it decides and reports, and writes nothing.
export const memberReadTools = {
  research,
  searchImages,
  webFetch,
  geoQuery,
  proposeImportMapping,
};

export type ReadToolName = keyof typeof readTools | keyof typeof memberReadTools;
