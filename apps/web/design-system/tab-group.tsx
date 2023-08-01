'use client';

import { cva } from 'class-variance-authority';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface TabGroupProps {
  tabs: Array<{ href: string; label: string }>;
}

export function TabGroup({ tabs }: TabGroupProps) {
  return (
    <div className="flex items-center gap-6 pb-2 border-b border-grey-02">
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

const tabStyles = cva('relative text-quoteMedium text-grey-04', {
  variants: {
    active: 'text-text',
  },
  defaultVariants: {
    active: false,
  },
});

function Tab({ href, label }: TabProps) {
  const active = usePathname() === href;

  return (
    <Link className={tabStyles({ active })} href={href}>
      {active && (
        <motion.div
          layoutId="tab-group-active-border"
          className="absolute left-0 -bottom-[9px] border-b border-text w-full"
        />
      )}
      {label}
    </Link>
  );
}
