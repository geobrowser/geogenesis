'use client';

import * as React from 'react';

import cx from 'classnames';

import { ChevronDownSmall } from '~/design-system/icons/chevron-down-small';
import { Text } from '~/design-system/text';

import type { DebateAnalyticsAttributes } from './hub-analytics';

/**
 * One collapsible block of claim cards under its heading, so a long list stays scannable: the
 * debate-again picker's curated blocks and Today's claims sections, and a lobby's Today's claims tab.
 */
export function CollapsibleClaimSection({
  name,
  count,
  defaultOpen = true,
  open: controlledOpen,
  onToggle,
  showCount = false,
  analytics,
  onOpenChange,
  children,
}: {
  name: string;
  count: number;
  /** The toggle's click-analytics label and intent. The name can carry a person's or curator's words. */
  analytics: DebateAnalyticsAttributes;
  defaultOpen?: boolean;
  /**
   * Held by the caller instead, with `onToggle` asked to change it — for Today's claims, whose
   * sections stay as the viewer left them for the day (GEO-3489).
   */
  open?: boolean;
  onToggle?: (open: boolean) => void;
  /** Draw the count beside the name. A closed section otherwise gives no hint of what is in it. */
  showCount?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}) {
  const [uncontrolledOpen, setOpen] = React.useState(defaultOpen);
  const open = controlledOpen ?? uncontrolledOpen;
  const contentId = React.useId();

  const onOpenChangeRef = React.useRef(onOpenChange);
  React.useLayoutEffect(() => {
    onOpenChangeRef.current = onOpenChange;
  });
  React.useLayoutEffect(() => {
    onOpenChangeRef.current?.(open);
    return () => onOpenChangeRef.current?.(true);
  }, [open]);

  return (
    <section>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={contentId}
        onClick={() => (onToggle ? onToggle(!open) : setOpen(current => !current))}
        {...analytics}
        className="mb-2 flex w-full items-center gap-2 text-left"
      >
        <Text as="h2" variant="smallTitle" color="text">
          {name}
        </Text>
        {showCount ? (
          <span
            aria-hidden
            className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-grey-01 px-1.5 text-metadataMedium text-grey-04 tabular-nums"
          >
            {count}
          </span>
        ) : null}
        <span className={cx('text-grey-04 transition-transform', open ? 'rotate-180' : undefined)}>
          <ChevronDownSmall />
        </span>
        <span className="sr-only">{`${count} ${count === 1 ? 'claim' : 'claims'}`}</span>
      </button>
      {open ? <div id={contentId}>{children}</div> : null}
    </section>
  );
}
