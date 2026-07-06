'use client';

import * as React from 'react';
import type { CSSProperties } from 'react';

import { useAtomValue, useSetAtom } from 'jotai';
import { RemoveScroll } from 'react-remove-scroll';

import { useIsMobileLayout } from '~/core/hooks/use-is-mobile-layout';
import { hideMainPageScrollbars } from '~/core/utils/hide-main-scrollbars';

import { rankingComposeRemoveScrollShardAtom, rankingFullscreenActiveAtom } from '~/atoms';

type Props = {
  children: React.ReactNode;
  style?: CSSProperties;
  coverNavbar?: boolean;
};

export function RankingComposeFullscreen({ children, style, coverNavbar = false }: Props) {
  const isMobile = useIsMobileLayout();
  const removeScrollShard = useAtomValue(rankingComposeRemoveScrollShardAtom);
  const removeScrollShards = React.useMemo(() => (removeScrollShard ? [removeScrollShard] : []), [removeScrollShard]);
  const lockScroll = isMobile;

  const setRankingFullscreenActive = useSetAtom(rankingFullscreenActiveAtom);
  React.useEffect(() => {
    setRankingFullscreenActive(true);
    return () => setRankingFullscreenActive(false);
  }, [setRankingFullscreenActive]);

  React.useLayoutEffect(() => {
    if (!coverNavbar) return;

    const html = document.documentElement;
    const body = document.body;

    html.setAttribute('data-ranking-compose-edit', '');
    body.setAttribute('data-ranking-compose-edit', '');
    html.style.setProperty('--ranking-compose-top', '0px');

    let restoreScrollbars = hideMainPageScrollbars();
    const rafId = requestAnimationFrame(() => {
      restoreScrollbars();
      restoreScrollbars = hideMainPageScrollbars();
    });

    return () => {
      cancelAnimationFrame(rafId);
      restoreScrollbars();
      html.removeAttribute('data-ranking-compose-edit');
      body.removeAttribute('data-ranking-compose-edit');
      html.style.removeProperty('--ranking-compose-top');
    };
  }, [coverNavbar]);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-white"
      style={{
        top: coverNavbar ? 0 : '44px',
        ...style,
      }}
    >
      {lockScroll ? (
        <RemoveScroll className="flex min-h-0 flex-1 flex-col overflow-hidden" shards={removeScrollShards}>
          {children}
        </RemoveScroll>
      ) : (
        children
      )}
    </div>
  );
}
