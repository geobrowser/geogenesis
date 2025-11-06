'use client';

import { cva } from 'class-variance-authority';
import cx from 'classnames';
import { motion } from 'framer-motion';
import { usePathname } from 'next/navigation';

import React, { useEffect, useRef, useState } from 'react';

import { useHydrated } from '~/core/hooks/use-hydrated';
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
  const [isDragging, setIsDragging] = useState(false);
  const dragStartX = useRef<number>(0);
  const scrollStartLeft = useRef<number>(0);

  useEffect(() => {
    const checkScroll = () => {
      const element = scrollRef.current;
      if (!element) return;

      const maxScrollLeft = element.scrollWidth - element.clientWidth;
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

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    dragStartX.current = e.clientX;
    scrollStartLeft.current = scrollRef.current?.scrollLeft || 0;
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !scrollRef.current) return;
    e.preventDefault();

    const deltaX = dragStartX.current - e.clientX;
    scrollRef.current.scrollLeft = scrollStartLeft.current + deltaX;
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    setIsDragging(true);
    dragStartX.current = touch.clientX;
    scrollStartLeft.current = scrollRef.current?.scrollLeft || 0;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging || !scrollRef.current) return;
    e.preventDefault();

    const touch = e.touches[0];
    const deltaX = dragStartX.current - touch.clientX;
    scrollRef.current.scrollLeft = scrollStartLeft.current + deltaX;
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
  };

  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (!isDragging || !scrollRef.current) return;
      e.preventDefault();

      const deltaX = dragStartX.current - e.clientX;
      scrollRef.current.scrollLeft = scrollStartLeft.current + deltaX;
    };

    const handleGlobalMouseUp = () => {
      setIsDragging(false);
    };

    const handleGlobalTouchMove = (e: TouchEvent) => {
      if (!isDragging || !scrollRef.current) return;
      e.preventDefault();

      const touch = e.touches[0];
      const deltaX = dragStartX.current - touch.clientX;
      scrollRef.current.scrollLeft = scrollStartLeft.current + deltaX;
    };

    const handleGlobalTouchEnd = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleGlobalMouseMove);
      document.addEventListener('mouseup', handleGlobalMouseUp);
      document.addEventListener('touchmove', handleGlobalTouchMove);
      document.addEventListener('touchend', handleGlobalTouchEnd);
    }

    return () => {
      document.removeEventListener('mousemove', handleGlobalMouseMove);
      document.removeEventListener('mouseup', handleGlobalMouseUp);
      document.removeEventListener('touchmove', handleGlobalTouchMove);
      document.removeEventListener('touchend', handleGlobalTouchEnd);
    };
  }, [isDragging]);

  return (
    <div className="relative">
      <div
        ref={scrollRef}
        className={cx(
          'relative z-0 cursor-grab select-none overflow-x-auto overflow-y-clip active:cursor-grabbing',
          className
        )}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div className="relative flex w-max items-center gap-6 pb-2">
          {tabs.map(t => (
            <Tab key={t.href} href={t.href} label={t.label} badge={t.badge} disabled={t.disabled} hidden={t.hidden} />
          ))}
          <div className="absolute bottom-0 left-0 right-0 z-0 h-px bg-grey-02" />
        </div>
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
  const isHydrated = useHydrated();
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
        // @HACK: This is a hack to workaround issues in the app directory. Right now (08/2023)
        // nested layouts in the app directory re-render when search params change. This causes
        // some of the layout to re-render, affecting the position of the active tab border.
        // When re-renders from the server happen the active tab border starts in the wrong position.
        <motion.div
          {...(isHydrated
            ? {
                layoutId: 'tab-group-active-border',
                layout: true,
              }
            : {})}
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
