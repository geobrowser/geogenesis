import { Close } from '~/design-system/icons/close';

type Props = {
  /** Full screen swaps the grabber for a top bar with a close button, as the sheet has no edge to grab. */
  isFullScreen?: boolean;
  onClose?: () => void;
};

export function MobileSheetGrabHandle({ isFullScreen = false, onClose }: Props) {
  if (isFullScreen && onClose) {
    return (
      <div
        className="flex shrink-0 cursor-grab touch-none items-center px-2 pt-[calc(env(safe-area-inset-top)+4px)] pb-1 active:cursor-grabbing"
        data-mobile-sheet-drag-handle
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="flex size-9 items-center justify-center rounded-full text-text transition-colors hover:bg-grey-01"
        >
          <Close />
        </button>
      </div>
    );
  }

  return (
    <div
      className="flex shrink-0 cursor-grab touch-none justify-center pt-2 pb-1 active:cursor-grabbing"
      data-mobile-sheet-drag-handle
      aria-hidden
    >
      <div className="h-1 w-10 rounded-full bg-grey-02" />
    </div>
  );
}
