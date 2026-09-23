'use client';

import { PopoverContent, Root, Trigger } from '@radix-ui/react-popover';

import * as React from 'react';

import { cva } from 'class-variance-authority';
import cx from 'classnames';

import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { trapWheelToElement } from '~/design-system/trap-wheel-scroll';
import { useAdaptiveDropdownPlacement } from '~/design-system/use-adaptive-dropdown-placement';

export type MenuAlign = 'end' | 'center' | 'start';

interface Props {
  children: React.ReactNode;
  trigger: React.ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pin the content to a trigger edge instead of choosing from the trigger's viewport position. */
  align?: MenuAlign;
  sideOffset?: number;
  className?: string;
  /** Override the inner scroll viewport classes (e.g., to set a different max height). */
  viewportClassName?: string;
  asChild?: boolean;
  modal?: boolean;
  /**
   * Radix returns focus to the trigger when a popover closes. When sibling
   * menus are switched between, that focus move lands outside the newly
   * opened menu and dismisses it — pass `e => e.preventDefault()` to opt out.
   */
  onCloseAutoFocus?: (event: Event) => void;
  /**
   * The trigger element, for callers that open a dialog from inside the menu. The item they
   * clicked unmounts with the menu, so the trigger is the only node left to return focus to.
   */
  triggerRef?: React.RefObject<HTMLButtonElement | null>;
  /**
   * The inner scroll viewport, for callers that need to know whether their content overflows it.
   *
   * The height that decides that is this component's — a max-height against the viewport — so a
   * caller cannot work it out from its own content alone, and guessing it from a row count would
   * be wrong on exactly the short screens where it matters most.
   */
  viewportRef?: React.Ref<HTMLDivElement>;
}

/** Outer shell: opaque + clips corners so overscroll never reveals “holes” behind the panel. */
const shellStyles = cva(
  'isolate z-100 w-full max-w-[360px] min-w-0 overflow-hidden rounded-lg border border-grey-02 bg-white shadow-lg outline-none focus:outline-none focus-visible:outline-none',
  {
    variants: {
      align: {
        start: 'origin-top-left',
        center: 'origin-top',
        end: 'origin-top-right',
      },
    },
  }
);

// 200px capped scrolling at ~5 items, so an 8-item menu had ~120px of scroll range.
// That tiny range made each wheel tick feel like a big jump even when the underlying
// scroll was smooth. Default to a height that fits ~10 items, capped at 75vh on small
// screens. Callers that want a smaller scroll well can still pass `viewportClassName`.
const defaultScrollViewportClass =
  'w-full max-h-[min(400px,75vh)] min-h-0 min-w-0 overflow-y-auto overscroll-contain scroll-smooth bg-white [background-clip:padding-box]';

export function Menu({
  children,
  trigger,
  open,
  onOpenChange,
  align,
  sideOffset = 8,
  asChild = false,
  className = '',
  viewportClassName,
  modal = false,
  onCloseAutoFocus,
  triggerRef: externalTriggerRef,
  viewportRef,
}: Props) {
  const internalTriggerRef = React.useRef<HTMLButtonElement>(null);
  const triggerRef = externalTriggerRef ?? internalTriggerRef;
  const [contentElement, setContentElement] = React.useState<HTMLDivElement | null>(null);
  const { align: adaptiveAlign, side: adaptiveSide } = useAdaptiveDropdownPlacement(triggerRef, {
    isOpen: open,
    preferredHeight: 240,
    gap: 8,
    contentElement,
  });
  const resolvedAlign = align === 'center' ? 'center' : (align ?? adaptiveAlign);

  const scrollRef = React.useRef<HTMLDivElement>(null);

  // Merged rather than handed over: the wheel trap below needs the node whether or not a caller
  // asked for it.
  //
  // The merge has to carry React 19's callback-ref cleanup through, because `viewportRef` is typed
  // as a full React ref and that contract is part of it. A caller may return a cleanup instead of
  // waiting to be called back with `null` — the natural shape for attaching an observer to the
  // viewport, which is what this prop exists for. Swallowing the return value would drop that
  // cleanup on the floor and then hand the caller the very `null` the contract promised would not
  // come, which a callback written for it has no reason to guard against.
  //
  // So: a cleanup from the caller is passed up, wrapped so this component's own ref is cleared
  // alongside it. No cleanup, and nothing is returned — React then falls back to calling this with
  // `null` on unmount, which is what clears both for every other kind of ref.
  const setScrollNode = React.useCallback(
    (node: HTMLDivElement | null) => {
      scrollRef.current = node;

      if (typeof viewportRef !== 'function') {
        if (viewportRef) (viewportRef as React.RefObject<HTMLDivElement | null>).current = node;
        return;
      }

      const cleanup = viewportRef(node);
      if (typeof cleanup !== 'function') return;

      return () => {
        scrollRef.current = null;
        cleanup();
      };
    },
    [viewportRef]
  );

  const onMenuWheel = React.useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    trapWheelToElement(scrollRef.current, e);
  }, []);

  // @TODO: accessibility for button focus states
  return (
    <Root onOpenChange={onOpenChange} open={open} modal={modal}>
      <Trigger ref={triggerRef} asChild={asChild} suppressHydrationWarning>
        {trigger}
      </Trigger>
      <PopoverContent
        ref={setContentElement}
        align={resolvedAlign}
        side={adaptiveSide}
        sideOffset={sideOffset}
        avoidCollisions={true}
        collisionPadding={8}
        className={cx(shellStyles({ align: resolvedAlign }), className)}
        onWheel={onMenuWheel}
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <div ref={setScrollNode} className={viewportClassName ?? defaultScrollViewportClass}>
          {children}
        </div>
      </PopoverContent>
    </Root>
  );
}

type MenuItemProps = {
  active?: boolean;
  href?: string;
  onClick?: () => void;
  children: React.ReactNode;
  className?: string;
};

export function MenuItem({ className = '', active = false, children, href, ...rest }: MenuItemProps) {
  if (href) {
    return (
      <Link
        href={href}
        className={cx(
          'group relative flex w-full items-center px-3 py-2.5 text-button text-text',
          active ? 'bg-grey-01' : 'bg-white',
          className
        )}
        {...rest}
      >
        <div className={cx('absolute inset-1 z-0 rounded', active ? 'bg-grey-01' : 'group-hover:bg-grey-01')} />
        <div className="relative z-10 flex w-full items-center gap-2">{children}</div>
      </Link>
    );
  }

  return (
    <button
      className={cx(
        'group relative flex w-full items-center px-3 py-[10px] text-button text-text',
        active ? 'bg-grey-01' : 'bg-white',
        className
      )}
      {...rest}
    >
      <div className={cx('absolute inset-1 z-0 rounded', active ? 'bg-grey-01' : 'group-hover:bg-grey-01')} />
      <div className="relative z-10 flex w-full items-center gap-2">{children}</div>
    </button>
  );
}
