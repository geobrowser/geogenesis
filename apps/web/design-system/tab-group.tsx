'use client';

import React, { useEffect, useRef, useState } from 'react';

import { cva } from 'class-variance-authority';
import cx from 'classnames';
import { motion } from 'framer-motion';
import { usePathname } from 'next/navigation';

import { useEditable } from '~/core/state/editable-store';
import { useActiveTabIdForEditor } from '~/core/state/editor/editor-provider';
import { useEntitySidePanelActiveTab } from '~/core/state/entity-side-panel-active-tab';
import { validateEntityId } from '~/core/utils/utils';

import { PrefetchLink as Link } from '~/design-system/prefetch-link';

interface TabGroupProps {
  tabs: Array<{ href: string; label: string; badge?: string; disabled?: boolean; hidden?: boolean }>;
  className?: string;
}

export function TabGroup({ tabs, className = '' }: TabGroupProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollPosition, setScrollPosition] = useState<'start' | 'middle' | 'end'>('start');
  const [isScrollable, setIsScrollable] = useState(false);
  const isDragging = useRef(false);
  const dragStartX = useRef<number>(0);
  const scrollStartLeft = useRef<number>(0);
  const pointerUpHandler = useRef<((e: PointerEvent) => void) | null>(null);

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
            <Tab key={t.href} href={t.href} label={t.label} badge={t.badge} disabled={t.disabled} hidden={t.hidden} />
          ))}
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

function tabIdFromEntityTabHref(href: string): string | null {
  const idx = href.indexOf('tabId=');
  if (idx === -1) return null;
  const raw = href.slice(idx + 6).split('&')[0];
  return validateEntityId(raw) ? raw : null;
}

function Tab({ href, label, badge, disabled, hidden }: TabProps) {
  const { editable } = useEditable();

  const path = usePathname();
  const activeTabId = useActiveTabIdForEditor();
  const sidePanelTab = useEntitySidePanelActiveTab();

  const fullPath = activeTabId ? `${path}?tabId=${activeTabId}` : `${path}`;
  const active = sidePanelTab
    ? tabIdFromEntityTabHref(href) === null
      ? activeTabId === null
      : activeTabId === tabIdFromEntityTabHref(href)
    : href === fullPath;

  if (!editable && hidden) {
    return null;
  }

  if (disabled) {
    return (
      <div className={tabGroupTabLinkStyles({ active, disabled })}>
        {label}
        {badge && <Badge>{badge}</Badge>}
      </div>
    );
  }

  const hrefTabId = tabIdFromEntityTabHref(href);

  if (sidePanelTab) {
    return (
      <button
        type="button"
        className={tabGroupTabLinkStyles({ active, disabled })}
        onClick={() => sidePanelTab.setActiveTabId(hrefTabId)}
      >
        {label}
        {badge && <Badge>{badge}</Badge>}
        {active && (
          <motion.div
            layoutId="tab-group-active-border"
            layout
            initial={false}
            transition={{ duration: 0.2 }}
            className="absolute right-0 bottom-[-8px] left-0 z-100 h-px bg-text"
          />
        )}
      </button>
    );
  }

  return (
    <Link className={tabGroupTabLinkStyles({ active, disabled })} href={href} prefetch>
      {label}
      {badge && <Badge>{badge}</Badge>}
      {active && (
        <motion.div
          layoutId="tab-group-active-border"
          layout
          initial={false}
          transition={{ duration: 0.2 }}
          className="absolute right-0 bottom-[-8px] left-0 z-100 h-px bg-text"
        />
      )}
    </Link>
  );
}

type BadgeProps = {
  children: React.ReactNode;
};

const Badge = ({ children }: BadgeProps) => {
  return (
    <div className="shrink-0">
      <div className="rounded bg-black px-1.25 py-0.5 text-xs leading-none text-white">{children}</div>
    </div>
  );
};
