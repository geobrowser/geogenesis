import * as React from 'react';

/**
 * Backdrop dismissal for a Radix dialog whose `Content` spans the viewport.
 *
 * Such a container sits above the overlay, so a click on the backdrop lands on
 * the container rather than "outside" the content — `onPointerDownOutside` never
 * fires. Spread these handlers onto `Content` to dismiss on a click that reached
 * the container itself.
 *
 * The press has to have *started* on the backdrop too. A click's target is the
 * common ancestor of its pointerdown and pointerup, so drag-selecting text in the
 * card and releasing past its edge produces a click targeting the container,
 * which would dismiss something nobody chose to dismiss.
 */
export function useBackdropDismiss(onDismiss: () => void) {
  const pressStartedOnBackdrop = React.useRef(false);

  return {
    onPointerDown: (event: React.PointerEvent) => {
      pressStartedOnBackdrop.current = event.target === event.currentTarget;
    },
    onClick: (event: React.MouseEvent) => {
      if (event.target === event.currentTarget && pressStartedOnBackdrop.current) onDismiss();
    },
  };
}
