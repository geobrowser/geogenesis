import * as React from 'react';

import cx from 'classnames';

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
 * browse sidebar is accounted for without measuring it. It is 32% because the row maxes out at
 * `ENTITY_PAGE_WITH_SIDEBAR_MAX_WIDTH` (1142px) and 360/1142 is 31.5%: the share reaches the cap
 * exactly where the layout stops growing, so a full-width screen is pixel-identical to before.
 * `min()` applies that cap; `min-w` floors it, because a rail thinner than that stops being
 * readable. It is `shrink-0` so flexbox never takes it below that floor — past the floor the
 * rail is dropped outright by `lg:hidden` rather than shaved further.
 *
 * `flushTop` drops the top padding so the rail's first section lines up with the top of the
 * column beside it. Without the padding, a stuck rail sits directly under the navbar.
 *
 * `divider` draws a vertical rule down the rail's left edge, in the tab bar's grey (`grey-02`), 32px
 * from its content, running the rail's full height — which is the viewport's, less the navbar — so
 * it reaches the bottom of the screen. The `before:` segment carries it up another 20px, across the `Spacer` a profile puts
 * between its tab bar and this row, so the rule starts at the tab bar itself.
 */
export function StickySideRail({
  children,
  flushTop = false,
  divider = false,
}: {
  children: React.ReactNode;
  flushTop?: boolean;
  divider?: boolean;
}) {
  return (
    <aside
      className={cx(
        'sticky top-11 ml-8 flex h-[calc(100dvh-2.75rem)] w-[min(var(--width-side-rail),32%)] min-w-[var(--width-side-rail-min)] shrink-0 flex-col self-start lg:hidden',
        divider &&
          "border-l border-grey-02 pl-8 before:absolute before:-top-5 before:-left-px before:h-5 before:border-l before:border-grey-02 before:content-['']"
      )}
    >
      <div className="no-scrollbar min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain">
        <div className={flushTop ? 'flex flex-col pb-6' : 'flex flex-col pt-5 pb-6'}>{children}</div>
      </div>
    </aside>
  );
}

export type SideRailSection = { key: string; node: React.ReactNode };

/**
 * The rail's sections, separated by rules.
 *
 * Built from a list rather than from `showA && showB ? <hr/> : null` pairs because every section is
 * optional: past two of them those pairs stop being readable, and a section that renders nothing
 * leaves a dangling rule behind it. Keys are stable, so a section appearing or disappearing does
 * not remount its neighbours.
 *
 * Shared by both rails — Explore's and the space overview's. They compose identically, and the
 * block had been written out twice.
 */
export function SideRailSections({ sections }: { sections: SideRailSection[] }) {
  return (
    <StickySideRail>
      {sections.map((section, index) => (
        <React.Fragment key={section.key}>
          {index > 0 ? <hr className="my-6 border-t border-divider" /> : null}
          {section.node}
        </React.Fragment>
      ))}
    </StickySideRail>
  );
}
