'use client';

import { cva } from 'class-variance-authority';
import cx from 'classnames';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import React from 'react';

import { useHydrated } from '~/core/hooks/use-hydrated';
import { useEditable } from '~/core/state/editable-store';

interface TabGroupProps {
  tabs: Array<{ href: string; label: string; badge?: string; disabled?: boolean; hidden?: boolean }>;
  className?: string;
}

export function TabGroup({ tabs, className = '' }: TabGroupProps) {
  return (
    <div className={cx('flex items-center gap-6 border-b border-grey-02 pb-2', className)}>
      {tabs.map(t => (
        <Tab key={t.href} href={t.href} label={t.label} badge={t.badge} disabled={t.disabled} hidden={t.hidden} />
      ))}
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

const tabStyles = cva('relative inline-flex items-center gap-1.5 text-quoteMedium transition-colors duration-100', {
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
  const decodedHref = decodeURIComponent(href);
  const isHydrated = useHydrated();
  const path = usePathname();
  const active = decodeURIComponent(path ?? '') === decodedHref;
  const { editable } = useEditable();

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
          className="absolute -bottom-[9px] left-0 w-full border-b border-text"
        />
      )}
      {label}
      {badge && <Badge>{badge}</Badge>}
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
