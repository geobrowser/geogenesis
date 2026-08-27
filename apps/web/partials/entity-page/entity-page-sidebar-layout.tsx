import * as React from 'react';

import { EntityPageContentContainer } from './entity-page-content-container';

type Props = {
  children: React.ReactNode;
  sidebar?: React.ReactNode;
};

export function EntityPageSidebarLayout({ children, sidebar = null }: Props) {
  return (
    <EntityPageContentContainer variant="auto-sidebar">
      <div className="flex items-start">
        <div className="min-w-0 flex-1">{children}</div>
        {sidebar}
      </div>
    </EntityPageContentContainer>
  );
}
