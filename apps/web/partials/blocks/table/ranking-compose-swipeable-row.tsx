'use client';

import * as React from 'react';

import cx from 'classnames';
import { type PanInfo, animate, motion, useMotionValue } from 'framer-motion';

import { Button } from '~/design-system/button';
import { Eye } from '~/design-system/icons/eye';
import { Trash } from '~/design-system/icons/trash';

const ACTION_BUTTON_SIZE_PX = 40;
const ACTION_GAP_PX = 8;
const ACTION_PADDING_PX = 8;
const ROW_ACTION_GAP_PX = 12;
const SINGLE_ACTION_CONTENT_WIDTH = ACTION_BUTTON_SIZE_PX + ACTION_PADDING_PX;
const DUAL_ACTION_CONTENT_WIDTH = ACTION_BUTTON_SIZE_PX * 2 + ACTION_GAP_PX + ACTION_PADDING_PX;
const SINGLE_ACTION_WIDTH = SINGLE_ACTION_CONTENT_WIDTH + ROW_ACTION_GAP_PX;
const DUAL_ACTION_WIDTH = DUAL_ACTION_CONTENT_WIDTH + ROW_ACTION_GAP_PX;

const SNAP_TRANSITION = { type: 'tween' as const, duration: 0.22, ease: 'easeOut' as const };

const SWIPE_ACTION_BUTTON_CLASS = 'h-10 w-10 shrink-0 !gap-0 !rounded-full !border-0 !p-0 !shadow-none min-w-0';

type Props = {
  rowKey: string;
  activeRowKey: string | null;
  onActiveRowKeyChange: (key: string | null) => void;
  showRemove?: boolean;
  onView: () => void;
  onRemove?: () => void;
  onPrimaryClick?: () => void;
  primaryDisabled?: boolean;
  swipeEnabled?: boolean;
  children: React.ReactNode;
};

export function RankingComposeSwipeableRow({
  rowKey,
  activeRowKey,
  onActiveRowKeyChange,
  showRemove = false,
  onView,
  onRemove,
  onPrimaryClick,
  primaryDisabled = false,
  swipeEnabled = true,
  children,
}: Props) {
  const actionContentWidth = showRemove ? DUAL_ACTION_CONTENT_WIDTH : SINGLE_ACTION_CONTENT_WIDTH;
  const revealWidth = showRemove ? DUAL_ACTION_WIDTH : SINGLE_ACTION_WIDTH;
  const isOpen = activeRowKey === rowKey;
  const x = useMotionValue(0);
  const suppressClickRef = React.useRef(false);
  const skipOpenSyncRef = React.useRef(false);
  const [isDragging, setIsDragging] = React.useState(false);

  // Swiped rows show a grey "pressed" background instead of hover styling,
  // which has no equivalent on touch devices.
  const isPressed = isDragging || isOpen;

  const animateTo = React.useCallback((target: number) => animate(x, target, SNAP_TRANSITION), [x]);

  React.useEffect(() => {
    if (!swipeEnabled) {
      x.set(0);
      return;
    }

    if (skipOpenSyncRef.current) {
      skipOpenSyncRef.current = false;
      return;
    }

    const target = isOpen ? -revealWidth : 0;
    if (Math.abs(x.get() - target) < 0.5) return;

    void animateTo(target);
  }, [animateTo, isOpen, revealWidth, swipeEnabled, x]);

  const snapTo = React.useCallback(
    (open: boolean) => {
      onActiveRowKeyChange(open ? rowKey : null);
    },
    [onActiveRowKeyChange, rowKey]
  );

  const resolveOpenFromDrag = React.useCallback(
    (currentX: number, velocityX: number) => {
      if (velocityX < -220) return true;
      if (velocityX > 220) return false;
      return currentX < -revealWidth / 2;
    },
    [revealWidth]
  );

  const commitSnap = React.useCallback(
    (open: boolean) => {
      const targetX = open ? -revealWidth : 0;
      skipOpenSyncRef.current = true;
      snapTo(open);
      void animateTo(targetX);
    },
    [animateTo, revealWidth, snapTo]
  );

  const handleDragEnd = (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    setIsDragging(false);

    if (Math.abs(info.offset.x) > 4) {
      suppressClickRef.current = true;
    }

    const shouldBeOpen = resolveOpenFromDrag(x.get(), info.velocity.x);
    commitSnap(shouldBeOpen);
  };

  const handleClick = () => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }

    if (isOpen) {
      commitSnap(false);
      return;
    }

    if (!primaryDisabled) {
      onPrimaryClick?.();
    }
  };

  return (
    <div
      className="relative w-full overflow-hidden overscroll-x-contain"
      onMouseDown={event => event.stopPropagation()}
    >
      <div
        className={cx(
          'absolute inset-y-0 right-0 grid items-center pr-2',
          isOpen ? 'pointer-events-auto z-[2]' : 'pointer-events-none z-0'
        )}
        style={{
          width: actionContentWidth,
          gridTemplateColumns: showRemove ? '40px 40px' : '40px',
          columnGap: showRemove ? ACTION_GAP_PX : 0,
          justifyContent: 'end',
        }}
        aria-hidden={!isOpen}
      >
        <Button
          type="button"
          variant="ghost"
          icon={<Eye color="grey-04" />}
          tabIndex={isOpen ? 0 : -1}
          onPointerDown={event => event.stopPropagation()}
          onMouseDown={event => event.stopPropagation()}
          onClick={() => {
            commitSnap(false);
            onView();
          }}
          className={cx(
            SWIPE_ACTION_BUTTON_CLASS,
            '!bg-grey-01 hover:!border-transparent hover:!bg-grey-01 hover:!shadow-none'
          )}
          aria-label="View entity details"
        />
        {showRemove ? (
          <Button
            type="button"
            variant="ghost"
            icon={<Trash color="red-01" />}
            tabIndex={isOpen ? 0 : -1}
            disabled={!onRemove}
            onPointerDown={event => event.stopPropagation()}
            onMouseDown={event => event.stopPropagation()}
            onClick={event => {
              event.stopPropagation();
              if (!onRemove) return;
              onRemove();
              commitSnap(false);
            }}
            className={cx(
              SWIPE_ACTION_BUTTON_CLASS,
              '!bg-red-02 hover:!border-transparent hover:!bg-red-02 hover:!shadow-none',
              !onRemove && 'opacity-40'
            )}
            aria-label="Remove from my ranking"
          />
        ) : null}
      </div>

      <motion.div
        drag={swipeEnabled ? 'x' : false}
        dragConstraints={{ left: -revealWidth, right: 0 }}
        dragDirectionLock
        dragElastic={0.06}
        dragMomentum={false}
        style={{ x, touchAction: 'pan-y' }}
        onDragStart={() => {
          suppressClickRef.current = false;
          setIsDragging(true);
        }}
        onDragEnd={handleDragEnd}
        onPointerDown={event => event.stopPropagation()}
        onMouseDown={event => event.stopPropagation()}
        onClick={handleClick}
        className={cx(
          'relative z-[1] w-full transition-colors duration-150 select-none',
          isPressed ? 'bg-grey-01' : 'bg-white',
          !primaryDisabled && onPrimaryClick && 'cursor-grab active:cursor-grabbing'
        )}
      >
        <div
          className={cx(
            'pointer-events-none w-full transition-colors duration-150',
            isPressed ? 'bg-grey-01' : 'bg-white'
          )}
        >
          {children}
        </div>
      </motion.div>
    </div>
  );
}
