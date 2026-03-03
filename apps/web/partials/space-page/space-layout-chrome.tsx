'use client';

import { usePathname } from 'next/navigation';

import { EntityPageContentContainer } from '~/partials/entity-page/entity-page-content-container';

type Props = {
  /** Rendered only when NOT on the Import page (cover image) */
  cover: React.ReactNode;
  /** Rendered inside container only when NOT on the Import page (heading, metadata, tabs) */
  headerBlock: React.ReactNode;
  children: React.ReactNode;
};

/**
 * On the Import flow (/import and /import/review) we show only the page content, no space header/cover/tabs.
 * On other space pages we show cover + container with headerBlock + children.
 */
export function SpaceLayoutChrome({ cover, headerBlock, children }: Props) {
  const pathname = usePathname();
  const isImportFlow = pathname != null && pathname.includes('/import');

  if (isImportFlow) {
    return <EntityPageContentContainer>{children}</EntityPageContentContainer>;
  }

  return (
    <>
      {cover}
      <EntityPageContentContainer>
        {headerBlock}
        {children}
      </EntityPageContentContainer>
    </>
  );
}
