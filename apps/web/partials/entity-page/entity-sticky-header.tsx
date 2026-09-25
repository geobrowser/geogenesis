'use client';

import * as React from 'react';

import cx from 'classnames';
import { AnimatePresence, motion } from 'framer-motion';
import { useAtomValue } from 'jotai';
import { createPortal } from 'react-dom';

import { useMirroredContentColumn } from '~/core/hooks/use-mirrored-content-column';
import { useScrolledPastElement } from '~/core/hooks/use-scrolled-past-element';
import { useName } from '~/core/state/entity-page-store/entity-store';
import { useQueryEntity } from '~/core/sync/use-store';
import { useEntityMediaUrl } from '~/core/utils/use-entity-media';

import { NativeGeoImage } from '~/design-system/geo-image';

import { APP_NAVBAR_HEIGHT } from '~/partials/entity-page/entity-sticky-header-host';
import { EntityVoteButtons } from '~/partials/entity-page/entity-vote-buttons';

import { ENTITY_PAGE_CONTENT_ATTRIBUTE, ENTITY_PAGE_CONTENT_MAX_WIDTH } from './entity-page-layout';
import { entityStickyHeaderHostElementAtom } from '~/atoms';

/**
 * Who you are reading about, once their name has scrolled away.
 *
 * Mounted once per entity route — in the `(entity)` layout, above every branch that draws a page —
 * and portalled into the shell's docked host. It watches for the title element rather than being
 * handed one, because four unrelated components draw that title and only one of them is on screen
 * at a time; see `useScrolledPastElement`.
 *
 * Nameless entities get nothing. The bar exists to say which entity this is, and an id in that slot
 * says less than the empty bar it would replace.
 *
 * The interaction on the right is `EntityVoteButtons` unmodified, which already resolves what it
 * should offer from the entity's own types: upvote/downvote for an ordinary entity, agree/disagree
 * for a claim, verify/dispute for a factual one. Reproducing that choice here would be a second
 * place for it to be made, and a second place for it to be made differently.
 *
 * Its row is measured off the page's own content column rather than given a width, for the same
 * reason: the pages it covers are 900, 840, 720 and 1142 wide with two different gutters between
 * them, and a number here would be a fourth opinion that drifts. See `useMirroredContentColumn`.
 */
export function EntityStickyHeader({ entityId, spaceId }: { entityId: string; spaceId: string }) {
  const host = useAtomValue(entityStickyHeaderHostElementAtom);

  // The scoped store first, so a name being edited on this page is the name on the bar; the
  // hydrated entity second, for a page whose name lives in some other space than the route's.
  const storedName = useName(entityId, spaceId);
  const { entity } = useQueryEntity({ id: entityId });
  const name = storedName ?? entity?.name ?? null;

  const mediaUrl = useEntityMediaUrl(entityId, spaceId);

  const { scrolledPast: isScrolledPastTitle, target: title } = useScrolledPastElement({
    selector: `[data-entity-page-title="${escapeSelectorValue(entityId)}"]`,
    topOffset: APP_NAVBAR_HEIGHT,
    enabled: Boolean(name),
  });

  // The column the tracked title sits in, so the bar lines up with the page under it whatever that
  // page's width happens to be.
  const column = useMirroredContentColumn(title, host, ENTITY_PAGE_CONTENT_ATTRIBUTE);

  if (!host) return null;

  // Falls back to the generic page's width until there is a column to read — the same answer this
  // gave before it measured anything, and the right one for a view that has not tagged its own.
  const rowStyle = column
    ? { marginLeft: column.left, width: column.width }
    : { maxWidth: ENTITY_PAGE_CONTENT_MAX_WIDTH };

  return createPortal(
    <AnimatePresence>
      {name && isScrolledPastTitle ? (
        <motion.div
          data-testid="entity-sticky-header"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.15, ease: 'easeOut' }}
          className="absolute inset-x-0 top-0 border-b border-divider bg-white"
        >
          <div
            data-testid="entity-sticky-header-row"
            className={cx('flex h-12 items-center gap-3', column ? null : 'mx-auto w-full px-4 mobile:px-5')}
            style={rowStyle}
          >
            {mediaUrl ? (
              <span className="size-7 shrink-0 overflow-hidden rounded-full bg-grey-01">
                <NativeGeoImage value={mediaUrl} alt="" className="h-full w-full object-cover" />
              </span>
            ) : null}
            {/* One line, always. A claim's name is a whole sentence, and a bar that grew to three
                lines would take back most of the room it exists to give. */}
            <span className="min-w-0 flex-1 truncate text-metadataMedium text-text">{name}</span>
            <span className="flex shrink-0 items-center">
              {/* Faces after the thumbs, not before them. Everywhere else the cluster leads because
                  it sits inside a card with the claim's text above it; here the bar's own text runs
                  right up to it, and a stack of faces between the name and the control it belongs to
                  reads as part of the name. */}
              <EntityVoteButtons entityId={entityId} spaceId={spaceId} claimResponderAvatarsPosition="trailing" />
            </span>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    host
  );
}

/**
 * Entity ids are uuids, so this is belt and braces — but the selector is built from a route param,
 * and `CSS.escape` is missing in jsdom, so the fallback has to be the identity rather than a throw.
 */
function escapeSelectorValue(value: string): string {
  return typeof CSS !== 'undefined' && typeof CSS.escape === 'function' ? CSS.escape(value) : value;
}
