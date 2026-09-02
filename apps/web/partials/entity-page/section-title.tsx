import * as React from 'react';

import cx from 'classnames';

import { Text } from '~/design-system/text';

/**
 * The heading over a section of a custom entity view.
 *
 * One component rather than the token repeated per section, because "every section on this page is
 * titled the same way" is a rule and a repeated `variant="mediumTitle"` is only a coincidence that
 * has held so far. The claim view had three sections at two different sizes before this.
 *
 * `mediumTitle` is the comments section's size, which is the one every other section is matched to:
 * comments appear under every entity, custom view or not, so it is the heading a reader has already
 * seen by the time they reach one of these pages.
 *
 * An `h2` because these sit under the page's `h1`. `CommentSection` still draws its own as a `div`
 * with the class — same size, weaker semantics — and is not changed here: it renders on every
 * entity page, so moving it is a wider change than the surface this belongs to.
 */
export function SectionTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <Text as="h2" variant="mediumTitle" color="text" className={cx('mb-3 block', className)}>
      {children}
    </Text>
  );
}
