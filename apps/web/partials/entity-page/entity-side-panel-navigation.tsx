'use client';

import * as React from 'react';

import { useRematchPanelContext } from '~/core/debates/rematch-panel-context';
import { useEntitySidePanel } from '~/core/hooks/use-entity-side-panel';
import { equals as idEquals } from '~/core/id/normalize';
import { useEntitySidePanelActiveTab } from '~/core/state/entity-side-panel-active-tab';
import { isModifiedClick } from '~/core/utils/is-modified-click';
import { validateEntityId, validateSpaceId } from '~/core/utils/utils';

const SYSTEM_TABS = new Set(['claims', 'debates', 'topics', 'sources', 'activity', 'comments']);

/** Capture before Next links or card handlers can navigate the room out from under the panel. */
export function EntitySidePanelNavigation({
  entityId,
  spaceId,
  children,
}: {
  entityId: string;
  spaceId: string;
  children: React.ReactNode;
}) {
  const rematch = useRematchPanelContext();
  const { openSidePanel } = useEntitySidePanel();
  const tabs = useEntitySidePanelActiveTab();

  const onClickCapture = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!rematch || event.defaultPrevented || isModifiedClick(event)) return;
    const target = event.target;
    const link = target instanceof Element ? target.closest('a[href]') : null;
    if (!(link instanceof HTMLAnchorElement) || link.hasAttribute('download') || link.target === '_blank') return;
    const href = link.getAttribute('href');
    if (!href || href.startsWith('#')) return;
    const url = new URL(link.href, window.location.href);
    // Leave browser actions such as mailto: and tel: alone.
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return;

    event.preventDefault();
    event.stopPropagation();
    const parts = url.pathname.split('/').filter(Boolean);
    const [, nextSpaceId, nextEntityId, systemTab] = parts;
    const tabId = url.searchParams.get('tabId');
    const isEntity =
      url.origin === window.location.origin &&
      parts[0] === 'space' &&
      validateSpaceId(nextSpaceId) &&
      validateEntityId(nextEntityId) &&
      (parts.length === 3 || (parts.length === 4 && SYSTEM_TABS.has(systemTab!))) &&
      url.searchParams.get('edit') !== 'true';

    if (!isEntity) {
      // Space homepages, external sources and full-screen tools have no entity-panel surface.
      // They must never replace the live room in this tab.
      window.open(url.href, '_blank', 'noopener,noreferrer');
      return;
    }

    const initialTab = tabId && validateEntityId(tabId) ? { tabId } : systemTab ? { systemTab } : undefined;
    const scrollToComments = url.hash === '#entity-comments';
    if (idEquals(entityId, nextEntityId!) && idEquals(spaceId, nextSpaceId!)) {
      if (initialTab?.systemTab) tabs?.setActiveSystemTab(initialTab.systemTab);
      else tabs?.setActiveTabId(initialTab?.tabId ?? null);
      if (!scrollToComments) return;
    }
    openSidePanel(nextEntityId!, nextSpaceId!, false, {
      forceRequestedSpace: true,
      initialTab,
      scrollToComments,
    });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col" onClickCapture={onClickCapture}>
      {children}
    </div>
  );
}
