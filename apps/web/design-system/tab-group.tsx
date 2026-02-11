'use client';

import { cva } from 'class-variance-authority';
import cx from 'classnames';
import { motion } from 'framer-motion';
import { usePathname } from 'next/navigation';

import React, { useEffect, useRef, useState } from 'react';

import { useEditable } from '~/core/state/editable-store';
import { useTabId } from '~/core/state/editor/use-editor';

import { PrefetchLink as Link } from '~/design-system/prefetch-link';

interface TabGroupProps {
  tabs: Array<{ href: string; label: string; badge?: string; disabled?: boolean; hidden?: boolean }>;
  className?: string;
}

export function TabGroup({ tabs, className = '' }: TabGroupProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollPosition, setScrollPosition] = useState<'start' | 'middle' | 'end'>('start');
  const isScrollable = useRef(false);
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
      isScrollable.current = maxScrollLeft > 0;

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
    if (!isScrollable.current) return;

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
    if (!isScrollable.current) return;

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
          'relative z-0 select-none overflow-x-auto overflow-y-clip',
          isScrollable.current && 'cursor-grab active:cursor-grabbing',
          '[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
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
        <div className="absolute bottom-0 left-0 right-0 z-0 h-px bg-grey-02" />
      </div>
      {scrollPosition !== 'end' && (
        <div className="pointer-events-none absolute bottom-0 right-0 top-0 z-50 h-6 w-[50px] bg-gradient-to-l from-white" />
      )}
      {scrollPosition !== 'start' && (
        <div className="pointer-events-none absolute bottom-0 left-0 top-0 z-50 h-6 w-[50px] bg-gradient-to-r from-white" />
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

const tabStyles = cva(
  'relative z-10 flex items-center gap-1.5 whitespace-nowrap text-quoteMedium transition-colors duration-100',
  {
    variants: {
      active: {
        true: 'text-text',
        false: 'text-grey-04 hover:text-text',
      },
      disabled: {
        true: 'cursor-not-allowed opacity-25 hover:!text-grey-04',
        false: '',
      },
    },
    defaultVariants: {
      active: false,
    },
  }
);

function Tab({ href, label, badge, disabled, hidden }: TabProps) {
  const { editable } = useEditable();

  const path = usePathname();
  const tabId = useTabId();

  const fullPath = tabId ? `${path}?tabId=${tabId}` : `${path}`;
  const active = href === fullPath;

  if (!editable && hidden) {
    return null;
  }

  if (disabled) {
    return (
      <div className={tabStyles({ active, disabled })}>
        {label}
        {badge && <Badge>{badge}</Badge>}
      </div>
    );
  }

  return (
    <Link className={tabStyles({ active, disabled })} href={href}>
      {label}
      {badge && <Badge>{badge}</Badge>}
      {active && (
        <motion.div
          layoutId="tab-group-active-border"
          layout
          initial={false}
          transition={{ duration: 0.2 }}
          className="absolute bottom-[-8px] left-0 right-0 z-100 h-px bg-text"
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
    <div className="flex-shrink-0">
      <div className="rounded bg-black px-[0.3125rem] py-0.5 text-xs leading-none text-white">{children}</div>
    </div>
  );
};
