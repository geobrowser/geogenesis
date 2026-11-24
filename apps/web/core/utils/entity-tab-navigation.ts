import { validateEntityId } from './utils';

export type EntitySidePanelTabSelection = { tabId: string; systemTab?: never } | { systemTab: string; tabId?: never };

export function entityTabIdFromHref(href: string): string | null {
  const queryStart = href.indexOf('?');
  if (queryStart === -1) return null;

  const fragmentStart = href.indexOf('#', queryStart);
  const query = href.slice(queryStart + 1, fragmentStart === -1 ? undefined : fragmentStart);
  const tabId = new URLSearchParams(query).get('tabId');
  return tabId && validateEntityId(tabId) ? tabId : null;
}

/** Tabs whose page has sub-paths that keep the tab selected: a chat channel (GEO-3818). */
const NESTED_TAB_SUFFIXES = ['/chat'];

function isNestedTabPath(href: string, fullPath: string) {
  return NESTED_TAB_SUFFIXES.some(suffix => href.endsWith(suffix)) && fullPath.startsWith(`${href}/`);
}

/** An entity's record routes (`/space/<s>/<e>/debates`), which have no tab while editing. */
const RECORD_ROUTE_SEGMENTS = new Set(['claims', 'debates', 'sources', 'topics']);

/**
 * A tab with `activeOnRecordRoutes`, selected because the route is one of the entity's record
 * routes rather than its own: it draws as selected, but a click on it still navigates.
 */
export function isSelectedThroughRecordRoute({
  href,
  fullPath,
  activeOnRecordRoutes = false,
}: {
  href: string;
  fullPath: string;
  activeOnRecordRoutes?: boolean;
}): boolean {
  if (!activeOnRecordRoutes || !fullPath.startsWith(`${href}/`)) return false;
  return RECORD_ROUTE_SEGMENTS.has(fullPath.slice(href.length + 1).split(/[/?#]/)[0]!);
}

/** One active-tab rule for read and edit tab bars, on routes and in the entity side panel. */
export function isEntityTabActive({
  href,
  activeTabId,
  fullPath,
  sidePanel,
  sidePanelKey,
  activeSystemTab,
  activeOnRecordRoutes = false,
}: {
  href: string;
  activeTabId: string | null;
  fullPath: string;
  sidePanel: boolean;
  sidePanelKey?: string;
  activeSystemTab?: string | null;
  /** Also active on the entity's record routes below `href` (e.g. `/debates` under Overview). */
  activeOnRecordRoutes?: boolean;
}): boolean {
  if (!sidePanel) {
    return (
      href === fullPath ||
      isNestedTabPath(href, fullPath) ||
      isSelectedThroughRecordRoute({ href, fullPath, activeOnRecordRoutes })
    );
  }
  if (sidePanelKey) {
    // A null system tab means Overview only when no authored tab owns the selection. Treating every
    // null as Overview made both markers active while an authored side-panel tab was selected.
    const selectedSystemTab = activeSystemTab ?? (activeTabId === null ? 'overview' : null);
    return selectedSystemTab === sidePanelKey;
  }

  const hrefTabId = entityTabIdFromHref(href);
  return hrefTabId === null ? activeTabId === null : activeTabId === hrefTabId;
}
