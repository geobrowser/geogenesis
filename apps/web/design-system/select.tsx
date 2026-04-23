import * as SelectPrimitive from '@radix-ui/react-select';

import * as React from 'react';

import cx from 'classnames';
import { RemoveScroll } from 'react-remove-scroll';

import { DROPDOWN_LIST_SCROLL_CLASSES, GEO_SELECT_VIEWPORT_CLASS } from './dropdown-list-viewport';
import { ChevronDownSmall } from './icons/chevron-down-small';

type Props = {
  value: string | undefined;
  onChange: (value: string) => void;
  options: { value: string; label: string; render?: React.ReactNode; disabled?: boolean; className?: string }[];
  variant?: 'primary' | 'secondary';
  placeholder?: React.ReactNode;
  className?: string;
  position?: 'item-aligned' | 'popper';
  disabled?: boolean;
};

export const Select = ({
  value,
  onChange,
  options,
  variant = 'secondary',
  placeholder = '',
  className = '',
  /** `popper` is the default so lists stay anchored inside nested popovers and modals (stable vs item-aligned). */
  position = 'popper',
  disabled = false,
}: Props) => {
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = React.useState(false);
  const [dynamicAlign, setDynamicAlign] = React.useState<'start' | 'end'>('start');

  const updateDynamicAlign = React.useCallback(() => {
    if (!triggerRef.current || typeof window === 'undefined') return;
    const rect = triggerRef.current.getBoundingClientRect();
    const triggerCenterX = rect.left + rect.width / 2;
    setDynamicAlign(triggerCenterX < window.innerWidth / 2 ? 'start' : 'end');
  }, []);

  React.useEffect(() => {
    if (!open) return;
    updateDynamicAlign();
    const onViewportChange = () => updateDynamicAlign();
    window.addEventListener('resize', onViewportChange);
    window.addEventListener('scroll', onViewportChange, true);
    return () => {
      window.removeEventListener('resize', onViewportChange);
      window.removeEventListener('scroll', onViewportChange, true);
    };
  }, [open, updateDynamicAlign]);

  return (
    <SelectPrimitive.Root
      value={value}
      onValueChange={onChange}
      open={open}
      onOpenChange={nextOpen => {
        setOpen(nextOpen);
        if (nextOpen) updateDynamicAlign();
      }}
    >
      <SelectPrimitive.Trigger
        ref={triggerRef}
        className={cx(
          variant === 'secondary' ? 'bg-white text-text' : 'bg-text text-white',
          !disabled
            ? 'hover:shadow-inner-text focus:shadow-inner-lg-text'
            : 'cursor-not-allowed! bg-grey-02! opacity-50 grayscale',
          'inline-flex flex-1 rounded px-3 py-2 text-button whitespace-nowrap shadow-inner-grey-02 data-placeholder:text-text',
          className
        )}
      >
        <div className="inline-flex min-h-[19px] w-full items-center justify-between gap-1">
          <div className={cx('truncate', value === '' && 'text-grey-03')}>
            <SelectPrimitive.Value placeholder={placeholder} />
          </div>
          <div className="shrink-0">
            <ChevronDownSmall color={variant === 'secondary' ? 'ctaPrimary' : 'white'} />
          </div>
        </div>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <RemoveScroll allowPinchZoom enabled={open}>
          <SelectPrimitive.Content
            className={cx(
              'z-[2000] overflow-hidden rounded border border-grey-02 bg-white shadow-lg',
              position === 'item-aligned'
                ? 'mt-10 max-w-[241px]'
                : 'w-(--radix-select-trigger-width) max-w-[min(100vw-2rem,var(--radix-select-trigger-width))]'
            )}
            position={position}
            side="bottom"
            align={dynamicAlign}
            sideOffset={4}
            collisionPadding={16}
            avoidCollisions
          >
            <SelectPrimitive.Viewport
              className={cx(GEO_SELECT_VIEWPORT_CLASS, DROPDOWN_LIST_SCROLL_CLASSES, 'p-0')}
            >
              <SelectPrimitive.Group className="divide-y divide-grey-02">
                {options.map(option => (
                  <SelectPrimitive.Item
                    key={option.value}
                    value={option.value}
                    disabled={option.disabled ?? false}
                    title={option.label}
                    aria-label={option.label}
                    className={cx(
                      'flex w-full flex-col justify-center truncate overflow-hidden px-3 py-2.5 text-button text-grey-04 select-none hover:cursor-pointer hover:bg-bg hover:text-text focus:bg-bg focus:text-text focus:outline-hidden data-highlighted:bg-bg data-highlighted:text-text',
                      option.disabled && 'cursor-not-allowed! opacity-25!',
                      option?.className
                    )}
                  >
                    <SelectPrimitive.ItemText>{option.render ?? option.label}</SelectPrimitive.ItemText>
                  </SelectPrimitive.Item>
                ))}
              </SelectPrimitive.Group>
            </SelectPrimitive.Viewport>
          </SelectPrimitive.Content>
        </RemoveScroll>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
};
