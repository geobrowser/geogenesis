import { validateEntityId } from './utils';

export function entityTabIdFromHref(href: string): string | null {
  const idx = href.indexOf('tabId=');
  if (idx === -1) return null;

  const raw = href.slice(idx + 6).split('&')[0];
  return validateEntityId(raw) ? raw : null;
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
  if (sidePanelKey) return (activeSystemTab ?? 'overview') === sidePanelKey;

  const hrefTabId = entityTabIdFromHref(href);
  return hrefTabId === null ? activeTabId === null : activeTabId === hrefTabId;
}
