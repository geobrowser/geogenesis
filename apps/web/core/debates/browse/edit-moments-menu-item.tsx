'use client';

import Link from 'next/link';

import { Tag } from '~/design-system/tag';

const ITEM_CLASS =
  'flex w-full cursor-pointer items-center gap-2 bg-white px-3 py-2.5 text-left text-button text-text hover:bg-bg md:hidden';

/**
 * "Edit moments" in a debate's "…" menu, for media admins: the feed card's and the Best debates
 * popup's (GEO-3742). Desktop only: the editor has no phone layout (`md:` is max-width). The host
 * decides who sees it; the server checks the admin again on every read and write the editor makes.
 * A link to the editor (`href`), or an action of its own (`onClick`, the popup's new tab).
 */
export function EditMomentsMenuItem(props: { href: string; onClick?: () => void } | { onClick: () => void }) {
  const content = (
    <>
      Edit moments <Tag>Admin</Tag>
    </>
  );
  const analytics = { 'data-geo-analytics-label': 'Edit moments', 'data-geo-analytics-intent': 'debate_action' };
  if ('href' in props) {
    return (
      <Link href={props.href} onClick={props.onClick} className={ITEM_CLASS} {...analytics}>
        {content}
      </Link>
    );
  }
  return (
    <button type="button" onClick={props.onClick} className={ITEM_CLASS} {...analytics}>
      {content}
    </button>
  );
}
