'use client';

import { cva } from 'class-variance-authority';
import Link from 'next/link';

import * as React from 'react';
import { useState } from 'react';

import { CheckCloseSmall } from '~/design-system/icons/check-close-small';

interface LinkableChipProps {
  href: string;
  children: React.ReactNode;
}

const linkableChipStyles = cva(
  'inline-flex min-h-[1.5rem] items-center break-words rounded-sm bg-white px-2 py-1 text-left text-metadataMedium !font-normal !leading-[1.125rem] shadow-inner shadow-text hover:cursor-pointer hover:bg-ctaTertiary hover:text-ctaPrimary hover:shadow-ctaPrimary focus:cursor-pointer focus:bg-ctaTertiary focus:text-ctaPrimary focus:shadow-inner-lg focus:shadow-ctaPrimary',
  {
    variants: {
      shouldClamp: {
        true: 'line-clamp-2',
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
