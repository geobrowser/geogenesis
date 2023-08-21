'use client';

import { cva } from 'class-variance-authority';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { useHydrated } from '~/core/hooks/use-hydrated';

interface TabGroupProps {
  tabs: Array<{ href: string; label: string }>;
}

export function TabGroup({ tabs }: TabGroupProps) {
  return (
    <div className="flex items-center gap-6 pb-2 border-b border-grey-02 ">
      {tabs.map(t => (
        <Tab key={t.href} href={t.href} label={t.label} />
      ))}
    </div>
  );
}

interface TabProps {
  href: string;
  label: string;
}

const tabStyles = cva('relative text-quoteMedium transition-colors duration-100', {
  variants: {
    active: {
      true: 'text-text',
      false: 'text-grey-04 hover:text-text',
    },
  },
  defaultVariants: {
    active: false,
  },
});

function Tab({ href, label }: TabProps) {
  const isHydrated = useHydrated();
  const path = usePathname();
  const active = path === href;

  return (
    <Link className={tabStyles({ active })} href={href}>
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
          className="absolute left-0 -bottom-[9px] border-b border-text w-full"
        />
      )}
      {label}
    </Link>
  );
}
