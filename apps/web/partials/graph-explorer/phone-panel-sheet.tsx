'use client';

import * as React from 'react';

import { useSetAtom } from 'jotai';

import { useGraphAnalytics } from '~/core/graph-explorer/graph-explorer-analytics';

import { BottomSheet } from '~/design-system/bottom-sheet';
import { ChevronUp } from '~/design-system/icons/chevron-up';

import { slideUpPopoverContainersAtom } from '~/atoms';

/**
 * On a phone the map has the screen (GEO-3849): the panel is a bottom sheet behind a pill at the
 * foot of the map, named for the centre. It starts closed and closes again on a recentre, so a hop
 * from a map tap or from a row inside the sheet always lands on the map.
 */
export function PhonePanelSheet({
  centreId,
  centreName,
  children,
}: {
  centreId: string;
  /** Null until the centre has loaded. */
  centreName: string | null;
  children: React.ReactNode;
}) {
  const analytics = useGraphAnalytics();
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    setOpen(false);
  }, [centreId]);

  // Popovers opened from the panel (a claim's voters, for one) portal to the sheet on top's container,
  // or to the body under this sheet's z-index and scroll lock. A host inside the sheet, registered
  // like a slide-up's (slide-up.tsx), keeps them over it. It unmounts with the sheet's content.
  const [popoverHost, setPopoverHost] = React.useState<HTMLElement | null>(null);
  const setPopoverContainers = useSetAtom(slideUpPopoverContainersAtom);
  const token = React.useMemo(() => Symbol('graph-panel-sheet'), []);
  React.useEffect(() => {
    if (!popoverHost) return;
    setPopoverContainers(current => [
      ...current.filter(entry => entry.token !== token),
      { token, container: popoverHost },
    ]);
    return () => setPopoverContainers(current => current.filter(entry => entry.token !== token));
  }, [popoverHost, setPopoverContainers, token]);

  const onOpenChange = React.useCallback(
    (next: boolean) => {
      setOpen(next);
      if (next) analytics?.interacted({ interaction: 'panel_sheet' });
    },
    [analytics]
  );

  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title={centreName ?? 'Details'}
      showTitle
      trigger={
        <button
          type="button"
          data-stage-control
          data-testid="graph-panel-handle"
          aria-label={centreName ? `Details for ${centreName}` : 'Details'}
          className="absolute bottom-[max(16px,env(safe-area-inset-bottom))] left-1/2 z-[10000] flex h-10 max-w-[calc(100%-32px)] -translate-x-1/2 items-center gap-2 rounded-full border border-white/20 bg-[rgba(30,30,33,.85)] px-4 text-[14px] text-[#f2f2f2] hover:border-white"
        >
          <span className="truncate">{centreName ?? 'Details'}</span>
          <span className="shrink-0">
            <ChevronUp />
          </span>
        </button>
      }
    >
      {children}
      <div ref={setPopoverHost} data-testid="graph-panel-popovers" />
    </BottomSheet>
  );
}
