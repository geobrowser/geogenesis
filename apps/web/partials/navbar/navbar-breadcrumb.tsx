import Image from 'next/legacy/image';
import Link from 'next/link';

import * as React from 'react';

import { getImagePath } from '~/core/utils/utils';

import { Spacer } from '~/design-system/spacer';
import { Text } from '~/design-system/text';

interface NavbarBreadcrumbProps {
  href: string;
  children: string;
  img: string | null;
}

export function NavbarBreadcrumb({ children, href, img }: NavbarBreadcrumbProps) {
  return (
    <Link
      href={href}
      className="flex cursor-pointer items-center whitespace-nowrap bg-white no-underline"
      title={children}
    >
      {img && (
        <>
          <div className="relative h-4 w-4 overflow-hidden rounded-sm">
            <Image
              priority
              layout="fill"
              objectFit="cover"
              src={getImagePath(img)}
              alt="Image representing the current Space"
            />
          </div>
          <Spacer width={8} />
        </>
      )}
      <div className="truncate sm:max-w-[20ch]">
        <Text variant="button" className="hover:!text-text">
          {children}
        </Text>
      </div>
    </Link>
  );
}
