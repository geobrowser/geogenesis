'use client';

import { cva } from 'class-variance-authority';
import cx from 'classnames';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { useHydrated } from '~/core/hooks/use-hydrated';

interface TabGroupProps {
  tabs: Array<{ href: string; label: string; disabled?: boolean }>;
  className?: string;
}

export function TabGroup({ tabs, className = '' }: TabGroupProps) {
  return (
    <div className={cx('flex items-center gap-6 border-b border-grey-02 pb-2', className)}>
      {tabs.map(t => (
        <Tab key={t.href} href={t.href} label={t.label} disabled={t.disabled} />
      ))}
    </div>
  );
}

interface TabProps {
  href: string;
  label: string;
  disabled?: boolean;
}

const tabStyles = cva('relative text-quoteMedium transition-colors duration-100', {
  variants: {
    active: {
      true: 'text-text',
      false: 'text-grey-04 hover:text-text',
    },
    disabled: {
      true: 'cursor-not-allowed hover:!text-grey-04 opacity-25',
      false: '',
    },
  },
  defaultVariants: {
    active: false,
  },
});

function Tab({ href, label, disabled }: TabProps) {
  const isHydrated = useHydrated();
  const path = usePathname();
  const active = path === href;

  if (disabled) {
    return <div className={tabStyles({ active, disabled })}>{label}</div>;
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
    </Link>
  );
}
