'use client';

import * as React from 'react';

import cx from 'classnames';

import { ENTITY_PAGE_CONTENT_ANCHOR } from './entity-page-anchors';
import { ENTITY_PAGE_WIDTH_VARIABLES, type EntityPageContentVariant } from './entity-page-layout';

type Props = {
  children: React.ReactNode;
  variant?: EntityPageContentVariant;
};

const variantClassName: Record<EntityPageContentVariant, string> = {
  content: 'max-w-[var(--entity-page-content-max-width)]',
  'with-sidebar': 'max-w-[var(--entity-page-with-sidebar-max-width)] lg:max-w-[var(--entity-page-content-max-width)]',
  'auto-sidebar':
    'max-w-[var(--entity-page-content-max-width)] has-[aside]:max-w-[var(--entity-page-with-sidebar-max-width)] lg:has-[aside]:max-w-[var(--entity-page-content-max-width)]',
};

export function EntityPageContentContainer({ children, variant = 'content' }: Props) {
  return (
    <div
      className={cx('mx-auto w-full', variantClassName[variant])}
      {...ENTITY_PAGE_CONTENT_ANCHOR}
      data-entity-page-content-variant={variant}
      style={ENTITY_PAGE_WIDTH_VARIABLES}
    >
      {children}
    </div>
  );
}
