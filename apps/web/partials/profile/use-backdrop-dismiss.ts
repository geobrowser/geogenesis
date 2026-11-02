import * as React from 'react';

/**
 * Backdrop dismissal for a Radix dialog whose `Content` spans the viewport.
 *
 * Such a container sits above the overlay, so a click on the backdrop lands on
 * the container rather than "outside" the content — `onPointerDownOutside` never
 * fires. Spread these handlers onto `Content` to dismiss on a click that reached
 * the container itself.
 *
 * The press has to have started *and* ended on the backdrop. A click's target is
 * the common ancestor of its pointerdown and pointerup, so a drag either way
 * between the card and the backdrop produces a click targeting the container:
 * drag-selecting text in the card and releasing past its edge, or pressing on the
 * backdrop and releasing over the card. Neither is a choice to dismiss.
 */
export function useBackdropDismiss(onDismiss: () => void) {
  const pressStartedOnBackdrop = React.useRef(false);
  const pressEndedOnBackdrop = React.useRef(false);

  const isBackdrop = (event: React.SyntheticEvent) => event.target === event.currentTarget;

  return {
    onPointerDown: (event: React.PointerEvent) => {
      pressStartedOnBackdrop.current = isBackdrop(event);
    },
    onPointerUp: (event: React.PointerEvent) => {
      pressEndedOnBackdrop.current = isBackdrop(event);
    },
    onClick: (event: React.MouseEvent) => {
      if (isBackdrop(event) && pressStartedOnBackdrop.current && pressEndedOnBackdrop.current) onDismiss();
    },
  };
}
