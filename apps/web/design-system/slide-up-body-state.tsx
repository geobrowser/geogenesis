'use client';

import * as React from 'react';

import { useAtomValue } from 'jotai';

import { slideUpOpenCountAtom } from '~/atoms';

/** Set on `html` and `body` while any slide-up is open. Read by the popover rules in styles.css. */
export const SLIDE_UP_OPEN_ATTRIBUTE = 'data-slide-up-open';

/**
 * Marks the document while any slide-up is open, so CSS can lift what portals to the body out from
 * under the sheet — radix poppers most visibly, which land at `z-index: auto` and so paint beneath a
 * sheet at 10000 however late in the DOM they are appended. Mirrors what the entity side panel
 * already does with `data-entity-side-panel-open` (GEO-2907).
 *
 * A single always-mounted owner rather than the sheets themselves, for two reasons: more than one can
 * be open at once, so no individual sheet knows whether it is the last one out; and the one that is
 * closing is often unmounting as it decrements, which leaves it in no position to reconcile the
 * document afterwards. This reads the same count the sheets publish.
 */
export function SlideUpBodyState() {
  const slideUpOpenCount = useAtomValue(slideUpOpenCountAtom);

  React.useEffect(() => {
    const targets = [document.documentElement, document.body];

    if (slideUpOpenCount > 0) {
      for (const target of targets) target.setAttribute(SLIDE_UP_OPEN_ATTRIBUTE, '');
      return;
    }

    for (const target of targets) target.removeAttribute(SLIDE_UP_OPEN_ATTRIBUTE);
  }, [slideUpOpenCount]);

  return null;
}
