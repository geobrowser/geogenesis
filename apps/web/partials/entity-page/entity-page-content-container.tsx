'use client';

import * as React from 'react';

import cx from 'classnames';

import {
  ENTITY_PAGE_CONTENT_MAX_WIDTH,
  ENTITY_PAGE_WITH_SIDEBAR_MAX_WIDTH,
  type EntityPageContentVariant,
} from './entity-page-layout';

type Props = {
  children: React.ReactNode;
  variant?: EntityPageContentVariant;
};

const widthVariables = {
  '--entity-page-content-max-width': `${ENTITY_PAGE_CONTENT_MAX_WIDTH}px`,
  '--entity-page-with-sidebar-max-width': `${ENTITY_PAGE_WITH_SIDEBAR_MAX_WIDTH}px`,
} as React.CSSProperties;

export function EntityPageContentContainer({ children, variant = 'content' }: Props) {
  return (
    <div
      className={cx(
        'mx-auto w-full',
        variant === 'with-sidebar'
          ? 'max-w-[var(--entity-page-with-sidebar-max-width)] lg:max-w-[var(--entity-page-content-max-width)]'
          : 'max-w-[var(--entity-page-content-max-width)]'
      )}
      data-entity-page-content-variant={variant}
      style={widthVariables}
    >
      {children}
    </div>
  );
}
