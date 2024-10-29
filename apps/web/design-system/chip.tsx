'use client';

import * as Tooltip from '@radix-ui/react-tooltip';
import { cva } from 'class-variance-authority';

import * as React from 'react';
import { useState } from 'react';

import { CheckCloseSmall } from '~/design-system/icons/check-close-small';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';

import { RelationSmall } from './icons/relation-small';
import { ColorName, colors } from './theme/colors';

interface LinkableChipProps {
  href: string;
  children: React.ReactNode;
}

const linkableChipStyles = cva(
  'inline-flex break-words rounded border border-grey-02 bg-white px-1.5 py-1 text-left text-metadataMedium !font-normal !leading-[1.125rem] hover:cursor-pointer hover:border-text hover:text-text focus:cursor-pointer focus:border-text focus:bg-ctaTertiary focus:text-text focus:shadow-inner-lg',
  {
    variants: {
      shouldClamp: {
        false: 'items-center',
        true: 'line-clamp-4',
      },
    },
    defaultVariants: {
      shouldClamp: false,
    },
  }
);

export function LinkableChip({ href, children }: LinkableChipProps) {
  return (
    <Link
      href={href}
      className={linkableChipStyles({ shouldClamp: typeof children === 'string' && children.length >= 42 })}
    >
      <span>{children}</span>
    </Link>
  );
}

interface LinkableRelationChipProps {
  entityHref: string;
  isEditing: boolean;
  relationHref: string;
  onDelete?: () => void;
  children: React.ReactNode;
}

const linkableRelationChipStyles = cva(
  'group inline-flex break-words rounded border border-grey-02 bg-white py-0.5 pl-1.5 text-metadata tabular-nums hover:cursor-pointer hover:border-text hover:text-text focus:cursor-pointer focus:border-text focus:bg-ctaTertiary focus:text-text focus:shadow-inner-lg',
  {
    variants: {
      shouldClamp: {
        false: 'items-center',
        true: 'line-clamp-4 items-start',
      },
      isDotsHovered: {
        true: '!border-grey-02',
      },
      isRelationHovered: {
        true: '!border-text !text-text',
      },
      isDeleteHovered: {
        true: '!border-text !text-text',
      },
    },
    defaultVariants: {
      shouldClamp: false,
      isDotsHovered: false,
      isRelationHovered: false,
      isDeleteHovered: false,
    },
  }
);

const relationChipDeleteIconStyles = cva('p-1 text-grey-04', {
  variants: {
    isRelationHovered: {
      true: '!text-grey-03',
    },
    isDeleteHovered: {
      true: '!text-text',
    },
  },
  defaultVariants: {
    isRelationHovered: false,
    isDeleteHovered: false,
  },
});

const relationChipRelationIconStyles = cva('p-1 text-grey-04', {
  variants: {
    isRelationHovered: {
      true: '!text-text',
    },
    isDeleteHovered: {
      true: '!text-grey-03',
    },
  },

  defaultVariants: {
    isRelationHovered: false,
    isDeleteHovered: false,
  },
});

const relationChipPopoverStyles = cva(
  'flex items-center rounded-[7px] border border-grey-04 bg-white hover:bg-divider',
  {
    variants: {
      isDeleteHovered: {
        true: '',
      },
      isRelationHovered: {
        true: '',
      },
    },
    defaultVariants: {
      isDeleteHovered: false,
      isRelationHovered: false,
    },
  }
);

const relationChipPopoverTriggerStyles = cva(
  'relative flex items-start px-1.5 py-1 text-grey-03 focus-within:text-text group-hover:text-text',
  {
    variants: {
      isDeleteHovered: {
        true: '!text-text',
      },
      isRelationHovered: {
        true: '!text-text',
      },
    },
    defaultVariants: {
      isDeleteHovered: false,
      isRelationHovered: false,
    },
  }
);

export function LinkableRelationChip({
  isEditing,
  entityHref,
  relationHref,
  children,
  onDelete,
}: LinkableRelationChipProps) {
  const [isDotsHovered, setIsDotsHovered] = useState(false);
  const [isRelationHovered, setIsRelationHovered] = useState(false);
  const [isDeleteHovered, setIsDeleteHovered] = useState(false);

  const shouldClamp = typeof children === 'string' && children.length >= 42;

  return (
    <div
      className={linkableRelationChipStyles({
        shouldClamp,
        isDotsHovered,
        isRelationHovered,
        isDeleteHovered,
      })}
    >
      <Link href={entityHref}>{children}</Link>
      <Tooltip.Provider delayDuration={0}>
        <Tooltip.Root>
          <Tooltip.Trigger asChild>
            <button
              className={relationChipPopoverTriggerStyles({
                isDeleteHovered,
                isRelationHovered,
              })}
              onMouseEnter={() => setIsDotsHovered(true)}
              onMouseLeave={() => setIsDotsHovered(false)}
            >
              {/* Expands hoverable area */}
              <div className="absolute -top-2 bottom-0 left-0 right-0" />
              <RelationDots color="current" />
            </button>
          </Tooltip.Trigger>
          <Tooltip.Portal>
            <Tooltip.Content
              sideOffset={0}
              className={relationChipPopoverStyles({
                isDeleteHovered,
                isRelationHovered,
              })}
            >
              <Link
                href={relationHref}
                onMouseEnter={() => setIsRelationHovered(true)}
                onMouseLeave={() => setIsRelationHovered(false)}
                className={relationChipRelationIconStyles({ isRelationHovered, isDeleteHovered })}
              >
                <RelationSmall />
              </Link>
              {isEditing && (
                <button
                  onClick={onDelete}
                  className={relationChipDeleteIconStyles({ isRelationHovered, isDeleteHovered })}
                  onMouseEnter={() => setIsDeleteHovered(true)}
                  onMouseLeave={() => setIsDeleteHovered(false)}
                >
                  <CheckCloseSmall />
                </button>
              )}
            </Tooltip.Content>
          </Tooltip.Portal>
        </Tooltip.Root>
      </Tooltip.Provider>
    </div>
  );
}

interface ChipButtonProps {
  onClick?: () => void;
  children: React.ReactNode;
  href: string;
}

const deletableChipStyles = cva(
  'group inline-flex min-h-[1.5rem] items-center gap-1 break-words rounded-sm bg-white px-2 py-1 text-left text-metadataMedium !font-normal !leading-[1.125rem] text-text shadow-inner shadow-text hover:cursor-pointer hover:bg-ctaTertiary hover:text-ctaPrimary hover:shadow-ctaPrimary focus:bg-ctaTertiary focus:text-ctaPrimary focus:shadow-inner-lg focus:shadow-ctaPrimary',
  {
    variants: {
      isWarning: {
        true: 'bg-red-02 text-red-01 shadow-red-01 hover:bg-red-02 hover:text-red-01 hover:shadow-red-01',
      },
    },
  }
);

const deleteButtonStyles = cva('cursor-pointer hover:!opacity-100 group-hover:opacity-50', {
  variants: {
    isWarning: {
      true: 'opacity-100',
    },
  },
});

export function DeletableChipButton({ onClick, children, href }: ChipButtonProps) {
  const [isWarning, setIsWarning] = useState(false);

  return (
    <div className={deletableChipStyles({ isWarning })}>
      <Link href={href} className="text-current">
        {children}
      </Link>
      <button
        className={deleteButtonStyles({ isWarning })}
        onClick={onClick}
        onMouseOver={() => setIsWarning(true)}
        onMouseOut={() => setIsWarning(false)}
      >
        <CheckCloseSmall />
      </button>
    </div>
  );
}

interface RelationDotsProps {
  color?: ColorName;
  fill?: ColorName;
}

function RelationDots({ color }: RelationDotsProps) {
  const themeColor = color ? colors.light[color] : 'currentColor';

  return (
    <svg width="2" height="6" viewBox="0 0 2 6" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="1" cy="1" r="1" fill={themeColor} />
      <circle cx="1" cy="5" r="1" fill={themeColor} />
    </svg>
  );
}
