import * as React from 'react';

import { EntityPageContentContainer } from './entity-page-content-container';

type Props = {
  children: React.ReactNode;
  sidebar?: React.ReactNode;
};

export function EntityPageSidebarLayout({ children, sidebar = null }: Props) {
  const hasSidebar = sidebar !== null && sidebar !== false;

  return (
    <EntityPageContentContainer variant={hasSidebar ? 'with-sidebar' : 'content'}>
      <div className="flex items-start">
        <div className="min-w-0 flex-1">{children}</div>
        {sidebar}
      </div>
    </EntityPageContentContainer>
  );
}
