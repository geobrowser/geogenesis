'use client';

import * as React from 'react';

import cx from 'classnames';
import { motion } from 'framer-motion';
import { useAtomValue } from 'jotai';
import { usePathname } from 'next/navigation';

import { isSpaceCallPath } from '~/core/space-calls/routes';
import { useDiff } from '~/core/state/diff-store';

import { debateFullscreenActiveAtom, graphExplorerActiveAtom } from '~/atoms';

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
  const graphExplorerActive = useAtomValue(graphExplorerActiveAtom);
  const isFullWidth =
    debateFullscreenActive ||
    graphExplorerActive ||
    /^\/space\/[^/]+\/community\/call\/[^/]+$/.test(pathname) ||
    // Debates and claims are both full-bleed browse surfaces — see `SpaceChromeGate`, which strips
    // the space header and tabs from the same two routes. The patterns are separate because that
    // file also runs on `/root`, which never reaches here.
    /^\/space\/[^/]+\/(debates|claims)(\/|$)/.test(pathname);
  // A debate room or a space call (the same room shell) sizes itself to the viewport under the
  // navbar. Page padding pushes it 6rem past the screen: its bottom bar falls below the fold and
  // scrolling outside its columns moves the page onto blank space. It keeps the centred width.
  const fillsViewport = /^\/debate\/[^/]+\/?$/.test(pathname) || isSpaceCallPath(pathname);

  return (
    <motion.main
      variants={variants}
      animate="animate"
      transition={transition}
      custom={isHidden}
      className={
        isFullWidth
          ? 'min-w-0 flex-1'
          : cx(
              'mx-auto max-w-[1200px] min-w-0 flex-1',
              !fillsViewport && 'pb-16',
              fillsViewport || pathname === '/explore' ? 'pt-0' : 'pt-8'
            )
      }
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
