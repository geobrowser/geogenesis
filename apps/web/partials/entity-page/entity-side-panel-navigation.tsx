'use client';

import * as React from 'react';

import { useRematchPanelContext } from '~/core/debates/rematch-panel-context';
import { useEntitySidePanel } from '~/core/hooks/use-entity-side-panel';
import { equals as idEquals } from '~/core/id/normalize';
import { useEntitySidePanelActiveTab } from '~/core/state/entity-side-panel-active-tab';
import { entityTabIdFromHref } from '~/core/utils/entity-tab-navigation';
import { isModifiedClick } from '~/core/utils/is-modified-click';
import { validateEntityId, validateSpaceId } from '~/core/utils/utils';

const SYSTEM_TABS = new Set(['claims', 'debates', 'topics', 'sources']);

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
    // Disabled controls own their refusal in onClick; capture must not activate them first.
    if (link.getAttribute('aria-disabled') === 'true') return;
    // Custom handlers resolve destinations (such as personal-space profiles) themselves.
    const navigation = link.getAttribute('data-entity-side-panel-navigation');
    if (navigation === 'custom') return;
    const href = link.getAttribute('href');
    if (!href || href.startsWith('#')) return;
    const url = new URL(link.href, window.location.href);
    // Leave browser actions such as mailto: and tel: alone.
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return;

    event.preventDefault();
    // Opted-in observers still track the click, but honor defaultPrevented instead of navigating twice.
    if (navigation !== 'observe') event.stopPropagation();
    const parts = url.pathname.split('/').filter(Boolean);
    const [, nextSpaceId, nextEntityId, systemTab] = parts;
    const tabId = entityTabIdFromHref(url.href);
    const isEntity =
      url.origin === window.location.origin &&
      parts[0] === 'space' &&
      validateSpaceId(nextSpaceId) &&
      validateEntityId(nextEntityId) &&
      (parts.length === 3 || (parts.length === 4 && SYSTEM_TABS.has(systemTab!))) &&
      url.searchParams.get('edit') !== 'true';

    const isBlockLink = url.searchParams.get('source') === 'copy_link' && url.hash.length > 1;
    if (!isEntity || isBlockLink || link.hasAttribute('data-entity-side-panel-full-page')) {
      // Block targets, debate videos, space homepages and full-screen tools need a full page.
      // They must never replace the live room in this tab.
      window.open(url.href, '_blank', 'noopener,noreferrer');
      return;
    }

    const initialTab = tabId ? { tabId } : systemTab ? { systemTab } : undefined;
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
