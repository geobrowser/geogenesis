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
  handleMove: (newIndex: number, oldIndex: number) => void;
  pageSize: number;
  pageNumber: number;
  className?: string;
  iconClassName?: string;
}) => {
  const [openedDialog, setOpenedDialog] = React.useState(false);
  const [newPosition, setNewPosition] = React.useState<number | null>(null);

  const handleClick = () => {
    const pageMaxIndex = pageSize * (pageNumber + 1);
    const pageMinIndex = pageSize * pageNumber + 1;
    if (Number(newPosition) > pageMaxIndex || Number(newPosition) < pageMinIndex) {
      // TODO
      // handle logic when position is out of the page range
      console.log('=>> another page skip ordering');
    } else {
      handleMove(Number(newPosition) - 1 - pageSize * pageNumber, position - 1);
    }
  };

  return (
    <div className={`absolute flex w-[152px] justify-end  pr-3 ${className ? className : ''}`}>
      {openedDialog && (
        <div className="mr-3 flex h-[110px] w-full flex-col gap-1 rounded-md border border-grey-02 bg-white p-1">
          <input
            value={newPosition ?? ''}
            onChange={e => setNewPosition(Number(e.target.value))}
            className="flex h-9 w-full items-center justify-center rounded border border-grey-02 text-center focus:outline-none"
          />
          <button
            onClick={handleClick}
            className="flex h-6 w-full items-center justify-center rounded border border-grey-02"
          >
            Move
          </button>
          <div className="flex h-[34px] flex-grow flex-col items-center justify-center rounded-md bg-divider p-1 ">
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
