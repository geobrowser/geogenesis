import * as React from 'react';

/**
 * Sticky right-hand rail shared by Explore and space overview panels.
 *
 * The width is fluid rather than fixed. It used to be a flat 360px held all the way down to the
 * `lg` cutoff, which is where GEO-2774 came from: between 1024px and ~1200px the rail kept every
 * one of those pixels while the feed beside it was squeezed until the Agree/Disagree pills read
 * "Ag..." and "Dis...". Taking a share of the row instead lets the rail give ground first.
 *
 * `32%` resolves against the flex row this sits in — the layout container, not the viewport — so
 * the rail narrows with the space actually available rather than with the window, and an open
 * browse sidebar is accounted for without measuring it. `min()` caps it at the design width so
 * nothing changes on a wide screen; `min-w` floors it, because a rail thinner than that stops
 * being readable. It is `shrink-0` so flexbox never takes it below that floor — past the floor the
 * rail is dropped outright by `lg:hidden` rather than shaved further.
 */
export function StickySideRail({ children }: { children: React.ReactNode }) {
  return (
    <aside className="sticky top-11 ml-8 flex h-[calc(100dvh-2.75rem)] w-[min(var(--width-side-rail),32%)] min-w-[var(--width-side-rail-min)] shrink-0 flex-col self-start lg:hidden">
      <div className="no-scrollbar min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain">
        <div className="flex flex-col pt-5 pb-6">{children}</div>
      </div>
    </aside>
  );
}
