'use client';

import * as React from 'react';

/**
 * Whether any modal dialog is currently open, anywhere on the page.
 *
 * Written because the alternative was not working. The email capture popup suppresses itself while
 * a surface the reader opened owns the screen, and that list was assembled by naming surfaces one
 * at a time — Privy's modal, then the chat panel, then the debates hub, then the entity side panel,
 * then the sign-in prompt and global search. Every round of review found another, which is the
 * signal that naming them is the wrong method: the list is every modal in the app, present and
 * future, and it is maintained by whoever remembers to come back here.
 *
 * So this asks the document instead. Both selectors are needed and neither is redundant:
 *
 *  - Radix renders `role="dialog"` with `data-state="open"` and, verified against
 *    `@radix-ui/react-dialog@1.1.19` rather than assumed, does **not** set `aria-modal`. That
 *    covers the sign-in prompt and global search, which are Radix underneath.
 *  - Hand-rolled dialogs here set `aria-modal="true"` themselves (the debate dialogs do) and have
 *    no `data-state`. `core/debates/matchmaking/debates-hub-panel.tsx` tests for that pair alone,
 *    which is why it does not see Radix dialogs either.
 *
 * Radix unmounts closed content, so presence is close to sufficient on its own; `data-state` is
 * there for anything mounted with `forceMount`.
 *
 * This does not replace the explicit checks at the call site. Privy's modal lives in its own
 * portal and reports through `usePrivy`, and the chat panel, the desktop debates hub and the
 * entity side panel are deliberately non-modal — they carry no dialog role at all, which is
 * correct for what they are and invisible to this.
 */
const OPEN_MODAL_SELECTOR =
  '[role="dialog"][data-state="open"], [role="dialog"][aria-modal="true"], [role="alertdialog"][data-state="open"], [role="alertdialog"][aria-modal="true"]';

/**
 * Layout effect on the client, plain effect on the server.
 *
 * The first read has to happen before paint: a passive effect runs after, so enabling this while a
 * dialog is already open — a reader returning to a restored scroll position with search open — lets
 * the caller paint over that dialog for a frame, which is the exact precedence this exists to keep.
 * The server has no layout phase and React warns if you ask for one, hence the swap.
 */
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? React.useLayoutEffect : React.useEffect;

export function useAnyModalOpen(enabled: boolean): boolean {
  const [isOpen, setIsOpen] = React.useState(false);

  useIsomorphicLayoutEffect(() => {
    if (!enabled) {
      setIsOpen(false);
      return;
    }

    let frame = 0;
    // Teardown removes this component's container from `body`, which is itself a mutation — the
    // observer can be handed it before `disconnect()` lands, scheduling a frame that fires after
    // cleanup has already run. Without this flag that callback reads the document and sets state
    // on an unmounted component, after the test that owned it has finished. It surfaced as
    // unrelated suites failing at random, which is exactly how this kind of leak presents.
    let cancelled = false;
    const read = () => {
      if (cancelled) return;
      setIsOpen(document.querySelector(OPEN_MODAL_SELECTOR) !== null);
    };

    // Coalesced to a frame: the observer watches the whole body, and this runs on a page holding an
    // infinite feed, so a re-read per mutation would mean a `querySelector` per appended card.
    const schedule = () => {
      if (frame || cancelled) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        read();
      });
    };

    read();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['role', 'data-state', 'aria-modal'],
    });

    return () => {
      cancelled = true;
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [enabled]);

  return isOpen;
}
