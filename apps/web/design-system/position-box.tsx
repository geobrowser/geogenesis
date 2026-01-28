'use client';

import React from 'react';

import { OrderDots } from './icons/order-dots';

export const PositionBox = ({
  position,
  totalEntries,
  handleMove,
  pageSize,
  pageNumber,
  className,
  iconClassName,
}: {
  position: number;
  totalEntries: number;
  handleMove: (targetPosition: number, currentPosition?: number) => void;
  pageSize: number;
  pageNumber: number;
  className?: string;
  iconClassName?: string;
}) => {
  const [openedDialog, setOpenedDialog] = React.useState(false);
  const [newPosition, setNewPosition] = React.useState<number | null>(null);

  const handleClick = () => {
    if (newPosition === null || newPosition < 1 || newPosition > totalEntries) {
      return;
    }

    const pageMaxIndex = pageSize * (pageNumber + 1);
    const pageMinIndex = pageSize * pageNumber + 1;
    const currentGlobalPosition = pageNumber * pageSize + position;

    if (newPosition > pageMaxIndex || newPosition < pageMinIndex) {
      // Cross-page move - use global move with both parameters
      handleMove(newPosition, currentGlobalPosition);
    } else {
      // Within-page move - pass both target and current positions
      handleMove(newPosition, currentGlobalPosition);
    }

    setOpenedDialog(false);
    setNewPosition(null);
  };

  return (
    <div className={`absolute flex w-[152px] justify-end pr-3 ${className ? className : ''}`}>
      {openedDialog && (
        <div className="mr-3 flex h-[110px] w-full flex-col gap-1 rounded-md border border-grey-02 bg-white p-1">
          <input
            type="number"
            min="1"
            max={totalEntries}
            value={newPosition ?? ''}
            onChange={e => setNewPosition(e.target.value === '' ? null : Number(e.target.value))}
            placeholder={`${pageNumber * pageSize + position}`}
            className="flex h-9 w-full items-center justify-center rounded border border-grey-02 text-center focus:outline-none"
          />
          <button
            onClick={handleClick}
            disabled={!newPosition || newPosition < 1 || newPosition > totalEntries}
            className="flex h-6 w-full items-center justify-center rounded border border-grey-02 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Move
          </button>
          <div className="flex h-[34px] flex-grow flex-col items-center justify-center rounded-md bg-divider p-1">
            <span className="text-center text-[11px] font-normal leading-[13px]">Current position</span>
            <span className="text-[11px] font-medium leading-[13px]">
              {pageNumber * pageSize + position}/{totalEntries}
            </span>
          </div>
        </div>
      )}
      <button className={`${iconClassName ? iconClassName : ''}`} onClick={() => setOpenedDialog(!openedDialog)}>
        <OrderDots color={openedDialog ? '#35363A' : '#B6B6B6'} />
      </button>
    </div>
  );
};
