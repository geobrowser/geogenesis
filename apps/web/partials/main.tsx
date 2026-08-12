'use client';

import * as React from 'react';

import { motion } from 'framer-motion';
import { useAtomValue } from 'jotai';
import { usePathname } from 'next/navigation';

import { useDiff } from '~/core/state/diff-store';

import { debateFullscreenActiveAtom } from '~/atoms';

type MainProps = {
  children: React.ReactNode;
};

export const Main = ({ children }: MainProps) => {
  const { isReviewOpen } = useDiff();
  const isHidden = isReviewOpen;
  const pathname = usePathname();
  // A Debate entity page renders the full-screen debates feed from an ordinary
  // `/space/{id}/{entityId}` route, which no pathname test can pick out — only the view itself
  // knows. Wrapping that takeover in the page chrome below makes the document taller than the
  // viewport, so the feed scrolls up under the sticky navbar.
  const debateFullscreenActive = useAtomValue(debateFullscreenActiveAtom);
  const isFullWidth =
    debateFullscreenActive ||
    /^\/space\/[^/]+\/community\/call\/[^/]+$/.test(pathname) ||
    /^\/space\/[^/]+\/debates(\/|$)/.test(pathname);

  return (
    <motion.main
      variants={variants}
      animate="animate"
      transition={transition}
      custom={isHidden}
      className={isFullWidth ? 'min-w-0 flex-1' : 'mx-auto max-w-[1200px] min-w-0 flex-1 pt-8 pb-16'}
    >
      {children}
    </motion.main>
  );
};

const transition = { type: 'spring' as const, duration: 0.5, bounce: 0 };

const variants = {
  animate: (open: boolean) => ({
    scale: open ? 0.95 : 1,
    opacity: open ? 0 : 1,
    transition: {
      type: 'spring' as const,
      duration: 0.5,
      bounce: 0,
      delay: open ? 0.5 : 0,
    },
  }),
};
