import { validateEntityId } from './utils';

export function entityTabIdFromHref(href: string): string | null {
  const queryStart = href.indexOf('?');
  if (queryStart === -1) return null;

  const fragmentStart = href.indexOf('#', queryStart);
  const query = href.slice(queryStart + 1, fragmentStart === -1 ? undefined : fragmentStart);
  const tabId = new URLSearchParams(query).get('tabId');
  return tabId && validateEntityId(tabId) ? tabId : null;
}

/** One active-tab rule for read and edit tab bars, on routes and in the entity side panel. */
export function isEntityTabActive({
  href,
  activeTabId,
  fullPath,
  sidePanel,
  sidePanelKey,
  activeSystemTab,
}: {
  href: string;
  activeTabId: string | null;
  fullPath: string;
  sidePanel: boolean;
  sidePanelKey?: string;
  activeSystemTab?: string | null;
}): boolean {
  if (!sidePanel) return href === fullPath;
  if (sidePanelKey) {
    // A null system tab means Overview only when no authored tab owns the selection. Treating every
    // null as Overview made both markers active while an authored side-panel tab was selected.
    const selectedSystemTab = activeSystemTab ?? (activeTabId === null ? 'overview' : null);
    return selectedSystemTab === sidePanelKey;
  }

  const hrefTabId = entityTabIdFromHref(href);
  return hrefTabId === null ? activeTabId === null : activeTabId === hrefTabId;
}
