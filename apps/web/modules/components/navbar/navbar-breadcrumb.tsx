import * as React from 'react';
import Image from 'next/legacy/image';
import Link from 'next/link';
import { Spacer } from '~/modules/design-system/spacer';
import { Text } from '~/modules/design-system/text';
import { getImagePath } from '~/modules/utils';

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
