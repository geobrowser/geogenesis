'use client';

import React, { useEffect, useRef, useState } from 'react';

import { cva } from 'class-variance-authority';
import cx from 'classnames';
import { motion } from 'framer-motion';
import { usePathname } from 'next/navigation';

import { useEditable } from '~/core/state/editable-store';
import { useActiveTabIdForEditor } from '~/core/state/editor/editor-provider';
import { useEntitySidePanelActiveTab } from '~/core/state/entity-side-panel-active-tab';
import { entityTabIdFromHref, isEntityTabActive } from '~/core/utils/entity-tab-navigation';

import { PrefetchLink as Link } from '~/design-system/prefetch-link';

export type TabGroupTab = {
  href: string;
  label: string;
  badge?: string;
  disabled?: boolean;
  hidden?: boolean;
  /** In-place product tab key used when this tab group renders in an entity side panel. */
  sidePanelKey?: string;
  /** Draws a rule before this tab, marking where one group of tabs ends and another begins. */
  dividerBefore?: boolean;
  /**
   * Only shown where the side rail is not.
   *
   * Breakpoints here are desktop-first (`lg` is max-width 1023px), and
   * `StickySideRail` drops itself at exactly that width — so a tab reaching
   * the rail's content appears precisely when the rail stops being there.
   */
  onlyWhenNarrow?: boolean;
};

interface TabGroupProps {
  tabs: TabGroupTab[];
  className?: string;
}

export type ActiveTabIndicatorPosition = { left: number; width: number };

/**
 * Measures one active tab for a row-owned indicator.
 *
 * Keeping the marker outside the tab links means route changes only animate its horizontal
 * position and width. A layout marker inside each link can also interpolate the page's vertical
 * scroll offset and travel through the labels when Next mounts the destination route.
 */
export function useActiveTabIndicator(layoutKey: unknown) {
  const activeTabElement = useRef<HTMLElement | null>(null);
  const activeTabObserver = useRef<ResizeObserver | null>(null);
  const [indicator, setIndicator] = useState<ActiveTabIndicatorPosition | null>(null);

  const measureActiveTab = React.useCallback(() => {
    const element = activeTabElement.current;
    if (!element) {
      setIndicator(null);
      return;
    }

    setIndicator(previous => {
      const next = { left: element.offsetLeft, width: element.offsetWidth };
      return previous?.left === next.left && previous.width === next.width ? previous : next;
    });
  }, []);

  const registerActiveTab = React.useCallback(
    (element: HTMLElement | null) => {
      activeTabObserver.current?.disconnect();
      activeTabObserver.current = null;
      activeTabElement.current = element;
      measureActiveTab();

      if (element && typeof ResizeObserver !== 'undefined') {
        activeTabObserver.current = new ResizeObserver(measureActiveTab);
        activeTabObserver.current.observe(element);
      }
    },
    [measureActiveTab]
  );

  // Re-measure when the row's tabs settle or responsive tabs appear. The active element itself is
  // observed from its ref callback, so switching active tabs also moves the observer immediately.
  React.useLayoutEffect(() => measureActiveTab(), [layoutKey, measureActiveTab]);

  useEffect(() => {
    window.addEventListener('resize', measureActiveTab);
    return () => {
      window.removeEventListener('resize', measureActiveTab);
      activeTabObserver.current?.disconnect();
    };
  }, [measureActiveTab]);

  return { indicator, registerActiveTab };
}

/**
 * The rule that separates one group of tabs from another.
 *
 * Shared with `EditableTabGroup` — the browse and edit bars draw the same row, and two copies of
 * this span drifted apart the moment either was touched.
 */
export function TabGroupDivider() {
  return <span aria-hidden className="h-4 w-px shrink-0 bg-grey-02" />;
}

export function ActiveTabIndicator({ indicator }: { indicator: ActiveTabIndicatorPosition | null }) {
  if (!indicator) return null;

  return (
    <motion.div
      aria-hidden
      data-active-tab-indicator
      initial={false}
      animate={{ x: indicator.left, width: indicator.width }}
      transition={{ duration: 0.2 }}
      className="absolute bottom-0 left-0 z-100 h-px bg-text"
    />
  );
}

export function TabGroup({ tabs, className = '' }: TabGroupProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollPosition, setScrollPosition] = useState<'start' | 'middle' | 'end'>('start');
  const [isScrollable, setIsScrollable] = useState(false);
  const isDragging = useRef(false);
  const dragStartX = useRef<number>(0);
  const scrollStartLeft = useRef<number>(0);
  const pointerUpHandler = useRef<((e: PointerEvent) => void) | null>(null);
  const { indicator, registerActiveTab } = useActiveTabIndicator(tabs);

  useEffect(() => {
    const checkScroll = () => {
      const element = scrollRef.current;
      if (!element) return;

      const maxScrollLeft = element.scrollWidth - element.clientWidth;

      // Check if content is scrollable (overflows container)
      setIsScrollable(maxScrollLeft > 0);

      if (element.scrollLeft <= 2) setScrollPosition('start');
      else if (element.scrollLeft >= maxScrollLeft - 2) setScrollPosition('end');
      else setScrollPosition('middle');
    };

    checkScroll();

    const element = scrollRef.current;
    if (element) {
      element.addEventListener('scroll', checkScroll);
      window.addEventListener('resize', checkScroll);
    }

    return () => {
      if (element) {
        element.removeEventListener('scroll', checkScroll);
        window.removeEventListener('resize', checkScroll);
      }
    };
  }, [tabs]);

  const handlePointerDown = (e: React.PointerEvent) => {
    // Only allow dragging if content is scrollable
    if (!isScrollable) return;

    isDragging.current = true;
    dragStartX.current = e.clientX;
    scrollStartLeft.current = scrollRef.current?.scrollLeft || 0;

    // Add document-level listeners to handle pointer release outside element
    const handlePointerUp = () => {
      isDragging.current = false;
      document.removeEventListener('pointerup', handlePointerUp);
      document.removeEventListener('pointercancel', handlePointerUp);
    };

    pointerUpHandler.current = handlePointerUp;
    document.addEventListener('pointerup', handlePointerUp);
    document.addEventListener('pointercancel', handlePointerUp);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    // Only allow dragging if content is scrollable
    if (!isScrollable) return;

    if (!isDragging.current || !scrollRef.current) return;
    e.preventDefault();

    const deltaX = dragStartX.current - e.clientX;
    scrollRef.current.scrollLeft = scrollStartLeft.current + deltaX;
  };

  // Cleanup drag state and listeners on unmount
  useEffect(() => {
    return () => {
      isDragging.current = false;
      if (pointerUpHandler.current) {
        document.removeEventListener('pointerup', pointerUpHandler.current);
        document.removeEventListener('pointercancel', pointerUpHandler.current);
      }
    };
  }, []);

  return (
    <div className="relative">
      <div
        ref={scrollRef}
        className={cx(
          'relative z-0 overflow-x-auto overflow-y-clip select-none',
          isScrollable && 'cursor-grab active:cursor-grabbing',
          '[scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden',
          className
        )}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
      >
        <div className="relative flex w-max items-center gap-6 pb-2">
          {tabs.map(t => (
            <React.Fragment key={t.href}>
              {t.dividerBefore && <TabGroupDivider />}
              {t.onlyWhenNarrow ? (
                <span className="hidden lg:contents">
                  <Tab
                    href={t.href}
                    label={t.label}
                    badge={t.badge}
                    disabled={t.disabled}
                    hidden={t.hidden}
                    sidePanelKey={t.sidePanelKey}
                    activeRef={registerActiveTab}
                  />
                </span>
              ) : (
                <Tab
                  href={t.href}
                  label={t.label}
                  badge={t.badge}
                  disabled={t.disabled}
                  hidden={t.hidden}
                  sidePanelKey={t.sidePanelKey}
                  activeRef={registerActiveTab}
                />
              )}
            </React.Fragment>
          ))}
          <ActiveTabIndicator indicator={indicator} />
        </div>
        <div className="sticky right-0 bottom-0 left-0 z-0 h-px bg-grey-02" />
      </div>
      {scrollPosition !== 'end' && isScrollable && (
        <div className="pointer-events-none absolute top-0 right-0 bottom-0 z-50 h-6 w-[50px] bg-linear-to-l from-white" />
      )}
      {scrollPosition !== 'start' && isScrollable && (
        <div className="pointer-events-none absolute top-0 bottom-0 left-0 z-50 h-6 w-[50px] bg-linear-to-r from-white" />
      )}
    </div>
  );
}

interface TabProps {
  href: string;
  label: string;
  badge?: React.ReactNode;
  disabled?: boolean;
  hidden?: boolean;
  sidePanelKey?: string;
  activeRef: (element: HTMLElement | null) => void;
}

/** Shared with entity/space `TabGroup` and governance home tab rows (same underline behavior). */
export const tabGroupTabLinkStyles = cva(
  'relative z-10 flex items-center gap-1.5 text-quoteMedium whitespace-nowrap transition-colors duration-100',
  {
    variants: {
      active: {
        true: 'text-text',
        false: 'text-grey-04 hover:text-text',
      },
      disabled: {
        true: 'cursor-not-allowed opacity-25 hover:text-grey-04!',
        false: '',
      },
    },
    defaultVariants: {
      active: false,
    },
  }
);

function Tab({ href, label, badge, disabled, hidden, sidePanelKey, activeRef }: TabProps) {
  const { editable } = useEditable();

  const path = usePathname();
  const activeTabId = useActiveTabIdForEditor();
  const sidePanelTab = useEntitySidePanelActiveTab();

  const fullPath = activeTabId ? `${path}?tabId=${activeTabId}` : `${path}`;
  const active = isEntityTabActive({
    href,
    activeTabId,
    fullPath,
    sidePanel: Boolean(sidePanelTab),
    sidePanelKey,
    activeSystemTab: sidePanelTab?.activeSystemTab,
  });

  if (!editable && hidden) {
    return null;
  }

  if (disabled) {
    return (
      <div ref={active ? activeRef : undefined} className={tabGroupTabLinkStyles({ active, disabled })}>
        {label}
        {badge && <Badge>{badge}</Badge>}
      </div>
    );
  }

  const hrefTabId = entityTabIdFromHref(href);

  if (sidePanelTab) {
    return (
      <button
        ref={active ? activeRef : undefined}
        type="button"
        className={tabGroupTabLinkStyles({ active, disabled })}
        onClick={() =>
          sidePanelKey ? sidePanelTab.setActiveSystemTab(sidePanelKey) : sidePanelTab.setActiveTabId(hrefTabId)
        }
      >
        {label}
        {badge && <Badge>{badge}</Badge>}
      </button>
    );
  }

  return (
    // No `scroll={false}` here, though it is tempting. This component draws the
    // tab bar on profiles, ordinary spaces, entities and governance alike, and
    // preserving the offset for all of them lands a reader who switched tabs
    // near the bottom of a long list somewhere past the end of a shorter one.
    //
    // The underline is one sibling owned by `TabGroup`, animated with x + width only. A shared
    // layout marker measured the page's vertical scroll between routes and flew through the label.
    <Link
      ref={active ? activeRef : undefined}
      className={tabGroupTabLinkStyles({ active, disabled })}
      href={href}
      prefetch
    >
      {label}
      {badge && <Badge>{badge}</Badge>}
    </Link>
  );
}

type BadgeProps = {
  children: React.ReactNode;
};

export const Badge = ({ children }: BadgeProps) => {
  return (
    <div className="shrink-0">
      <div className="rounded bg-black px-1.25 py-0.5 text-xs leading-none text-white">{children}</div>
    </div>
  );
};
