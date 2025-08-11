'use client';

import { cva } from 'class-variance-authority';
import cx from 'classnames';
import { motion } from 'framer-motion';
import { usePathname } from 'next/navigation';

import React from 'react';

import { useHydrated } from '~/core/hooks/use-hydrated';
import { useSpaceId } from '~/core/hooks/use-space-id';
import { useCanUserEdit } from '~/core/hooks/use-user-is-editing';
import { useEditable } from '~/core/state/editable-store';
import { useTabId } from '~/core/state/editor/use-editor';

import { PrefetchLink as Link } from '~/design-system/prefetch-link';

interface TabGroupProps {
  tabs: Array<{ href: string; label: string; badge?: string; disabled?: boolean; hidden?: boolean }>;
  className?: string;
}

export function TabGroup({ tabs, className = '' }: TabGroupProps) {
  const spaceId = useSpaceId();
  const canUserEdit = useCanUserEdit(spaceId ?? '');

  tabs = canUserEdit ? tabs : tabs.filter(tab => tab.label !== 'Activity');
  return (
    <div
      className={cx('relative z-0 flex max-w-full items-center gap-6 overflow-x-auto overflow-y-clip pb-2', className)}
    >
      {tabs.map(t => (
        <Tab key={t.href} href={t.href} label={t.label} badge={t.badge} disabled={t.disabled} hidden={t.hidden} />
      ))}
      <span className="absolute bottom-0 left-0 right-0 z-0 h-px bg-grey-02" />
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

const tabStyles = cva('relative z-10 flex items-center gap-1.5 text-quoteMedium transition-colors duration-100', {
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
});

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
