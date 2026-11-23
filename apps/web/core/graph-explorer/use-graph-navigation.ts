'use client';

import * as React from 'react';

import { useRouter } from 'next/navigation';

import { readSession, writeSession } from '~/core/utils/session-storage';

import { type GraphHistory, goBack, graphHistoryHref, sameHistory } from './history';

const PUSHED_KEY = 'graph-explorer:pushed';
const PUSHED_LIMIT = 50;

function readPushed(): string[] {
  try {
    const parsed: unknown = JSON.parse(readSession(PUSHED_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((href): href is string => typeof href === 'string') : [];
  } catch {
    return [];
  }
}

function markPushed(href: string) {
  writeSession(
    PUSHED_KEY,
    JSON.stringify([...readPushed().filter(entry => entry !== href), href].slice(-PUSHED_LIMIT))
  );
}

/**
 * Moves through the graph with the browser's history: each hop is a push, and returning to the
 * previous centre is a browser Back when this tab reached the current URL by an explorer push
 * (kept in sessionStorage, so it survives a reload). Otherwise, as on a shared link, it replaces.
 */
export function useGraphNavigation(history: GraphHistory, params: URLSearchParams) {
  const router = useRouter();
  return React.useCallback(
    (next: GraphHistory) => {
      if (sameHistory(next, history)) return;
      const nextHref = graphHistoryHref(next, params);
      if (history.back.length > 0 && sameHistory(next, goBack(history))) {
        if (readPushed().includes(graphHistoryHref(history, params))) router.back();
        else router.replace(nextHref, { scroll: false });
        return;
      }
      markPushed(nextHref);
      router.push(nextHref, { scroll: false });
    },
    [history, params, router]
  );
}
