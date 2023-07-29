'use client';

import { cva } from 'class-variance-authority';
import cx from 'classnames';
import Link from 'next/link';

import * as React from 'react';
import { useState } from 'react';

import { CheckCloseSmall } from '~/design-system/icons/check-close-small';

interface LinkableChipProps {
  href: string;
  children: React.ReactNode;
}

export function LinkableChip({ href, children }: LinkableChipProps) {
  const linkableChipStyles = cva(
    cx(
      'text-metadataMedium rounded-sm shadow-inner shadow-text min-h-[1.5rem] px-2 py-1 inline-flex items-center bg-white text-left hover:cursor-pointer hover:text-ctaPrimary hover:bg-ctaTertiary hover:shadow-ctaPrimary focus:cursor-pointer focus:text-ctaPrimary focus:shadow-inner-lg focus:bg-ctaTertiary focus:shadow-ctaPrimary break-words !font-normal !leading-[1.125rem]',
      typeof children === 'string' && children.length >= 42 && 'line-clamp-2'
    )
  );

  return (
    <Link href={href} className={linkableChipStyles()}>
      <span>{children}</span>
    </Link>
  );
}

interface ChipButtonProps {
  onClick: () => void;
  children: React.ReactNode;
  href: string;
}

const deletableChipStyles = cva(
  'items-center gap-1 text-metadataMedium text-left rounded-sm min-h-[1.5rem] py-1 inline-flex px-2 text-text bg-white shadow-inner shadow-text hover:bg-ctaTertiary hover:text-ctaPrimary hover:shadow-ctaPrimary focus:bg-ctaTertiary focus:text-ctaPrimary focus:shadow-inner-lg focus:shadow-ctaPrimary hover:cursor-pointer group break-words !font-normal !leading-[1.125rem]',
  {
    variants: {
      isWarning: {
        true: 'bg-red-02 text-red-01 shadow-red-01 hover:text-red-01 hover:bg-red-02 hover:shadow-red-01',
      },
    },
  }
);

const deleteButtonStyles = cva('cursor-pointer group-hover:opacity-50 hover:!opacity-100', {
  variants: {
    isWarning: {
      true: 'opacity-100',
    },
  },
});

export function DeletableChipButton({ onClick, children, href }: ChipButtonProps) {
  const [isWarning, setIsWarning] = useState(false);

  return (
    <button className={deletableChipStyles({ isWarning })}>
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
    </button>
  );
}
