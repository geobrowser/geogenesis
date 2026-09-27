export function MobileSheetGrabHandle() {
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
