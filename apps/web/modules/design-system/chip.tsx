import { cva } from 'class-variance-authority';
import Link from 'next/link';
import { useState } from 'react';
import { CheckCloseSmall } from '~/modules/design-system/icons/check-close-small';

interface LinkableChipProps {
  href: string;
  children: React.ReactNode;
}

const linkableChipStyles = cva(
  'text-metadataMedium rounded shadow-inner shadow-text py-1 px-2 inline-block bg-white text-left hover:cursor-pointer hover:text-ctaPrimary hover:bg-ctaTertiary hover:shadow-ctaPrimary focus:cursor-pointer focus:text-ctaPrimary focus:shadow-inner-lg focus:bg-ctaTertiary focus:shadow-ctaPrimary'
);

export function LinkableChip({ href, children }: LinkableChipProps) {
  return (
    <Link href={href} passHref>
      <a className={linkableChipStyles()}>{children}</a>
    </Link>
  );
}

interface ChipButtonProps {
  onClick: () => void;
  children: React.ReactNode;
  href: string;
}

const deletableChipStyles = cva(
  'flex items-center gap-1 text-metadataMedium text-left rounded py-1 px-2 text-text bg-white shadow-inner shadow-text hover:bg-ctaTertiary hover:text-ctaPrimary hover:shadow-ctaPrimary  focus:bg-ctaTertiary focus:text-ctaPrimary focus:shadow-inner-lg focus:shadow-ctaPrimary hover:cursor-pointer',
  {
    variants: {
      isWarning: {
        true: 'bg-red-02 text-red-01 shadow-red-01 hover:text-red-01 hover:bg-red-02 hover:shadow-red-01',
      },
    },
  }
);

const deleteButtonStyles = cva('cursor-pointer', {
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
      <Link href={href} passHref>
        <a className="text-current">{children}</a>
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
