import * as React from 'react';
import cx from 'classnames';
import Image from 'next/image';
import Link from 'next/link';

import { Spacer } from './spacer';
import { Text } from './text';

interface LinkableBreadcrumbProps {
  href: string;
  children: string;
  isNested: boolean;
  img: string | null;
  shouldTruncate?: boolean;
}

export function LinkableBreadcrumb({ children, href, img, isNested, shouldTruncate }: LinkableBreadcrumbProps) {
  return (
    <Link href={href} passHref>
      <a
        className="pypx [&>span]:transition-color flex cursor-pointer items-center whitespace-nowrap no-underline [&>span]:duration-150 [&>span]:ease-in-out hover:[&>span]:text-text"
        title={children}
      >
        {img && (
          <>
            <div className="rounded-sm relative hidden h-4 w-4">
              <Image priority layout="fill" objectFit="cover" src={img} alt="Image representing the current Space" />
            </div>
            <Spacer width={8} />
          </>
        )}
        <div className={cx('max-w-full overflow-hidden', shouldTruncate && 'truncate')}>
          <Text variant="metadataMedium" color={isNested ? 'grey-04' : 'text'}>
            {children}
          </Text>
        </div>
      </a>
    </Link>
  );
}

interface BreadcrumbProps {
  children: string;
  img: string | null;
}

export function Breadcrumb({ children, img }: BreadcrumbProps) {
  return (
    <span className="flex cursor-pointer items-center whitespace-nowrap py-px no-underline">
      {img && (
        <>
          <div className="rounded-sm relative h-3 w-3 overflow-hidden">
            <Image priority layout="fill" objectFit="cover" src={img} alt="Image representing the current Space" />
          </div>
          <Spacer width={4} />
        </>
      )}
      <Text variant="tag" color={'text'}>
        {children}
      </Text>
    </span>
  );
}
