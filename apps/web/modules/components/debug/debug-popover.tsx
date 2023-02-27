import * as PopoverPrimitive from '@radix-ui/react-popover';
import { cx } from 'class-variance-authority';
import { AnimatePresence, motion } from 'framer-motion';
import React, { useState } from 'react';
import { Eye } from '~/modules/design-system/icons/eye';
import { useWindowSize } from '~/modules/hooks/use-window-size';


const MotionContent = motion(PopoverPrimitive.Content);




interface Props {
  containerWidth: number;
  children: React.ReactNode;
  className?: string;
}

export function DebugPopover({ children, containerWidth, className }: Props) {
  const { width } = useWindowSize();

  // Using a controlled state to enable exit animations with framer-motion
  const [open, setOpen] = useState(false);

  return (
    <PopoverPrimitive.Root onOpenChange={setOpen}>
    <PopoverPrimitive.Trigger asChild>
      <button
        className={cx(
          open ? 'bg-grey-01' : 'bg-white',
          'h-full py-2 px-3 text-grey-04 transition-colors duration-150 ease-in-out hover:cursor-pointer hover:bg-grey-01 hover:text-text focus:text-text focus:ring-ctaPrimary active:text-text active:ring-ctaPrimary',
          className
        )}
        aria-label="advanced-filter-button"
      >
        <Eye />
      </button>
    </PopoverPrimitive.Trigger>
    <AnimatePresence mode="wait">
      {open ? (
        <MotionContent
          forceMount={true} // We force mounting so we can control exit animations through framer-motion
          initial={{ opacity: 0, y: -10 }}
          exit={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: 0.1,
            ease: 'easeInOut',
          }}
          avoidCollisions={true}
          className="relative z-[1] rounded border border-grey-02 bg-white p-3 shadow-button md:mx-auto md:w-[98vw] md:self-start"
          style={{ width: `calc(${containerWidth}px / 2)` }}
          sideOffset={6}
          alignOffset={-1}
          align={width > 768 ? 'end' : 'start'}
        >
         {children}
        </MotionContent>
      ) : null}
    </AnimatePresence>
  </PopoverPrimitive.Root>
  );
}
