'use client';

import * as React from 'react';

import cx from 'classnames';

import type { DebateResponseKind } from '~/core/debates/api';
import { uuidToHex } from '~/core/id/normalize';
import { type ActiveResponseDirection, responsePositionLabel } from '~/core/responses/entity-response';
import { useEntityResponders } from '~/core/responses/use-entity-responders';

import { CLAIM_RESPONSE_OBJECT_TYPE } from './claim-response-summary';

type ClaimCommentPositionContextValue = {
  directions: Map<string, ActiveResponseDirection>;
  responseKind: DebateResponseKind;
};

const ClaimCommentPositionContext = React.createContext<ClaimCommentPositionContextValue | null>(null);

/**
 * Makes the current position of each claim commenter available to the generic comment rows.
 *
 * The responder query is the same one the claim verdict already uses, so this normally reads a
 * warm cache rather than adding another request. The viewer's optimistic direction wins over that
 * indexed list so their newly posted explanation carries the side they just selected immediately.
 */
export function ClaimCommentPositionProvider({
  entityId,
  spaceId,
  responseKind,
  viewerDirection,
  viewerSpaceId,
  children,
}: {
  entityId: string;
  spaceId: string;
  responseKind: DebateResponseKind;
  viewerDirection: ActiveResponseDirection | null;
  viewerSpaceId: string | null;
  children: React.ReactNode;
}) {
  const { responders } = useEntityResponders({
    entityId,
    spaceId,
    objectType: CLAIM_RESPONSE_OBJECT_TYPE,
    responseKind,
    viewerSpaceId,
    optimisticViewerResponse: viewerDirection,
  });

  const directions = React.useMemo(() => {
    const result = new Map<string, ActiveResponseDirection>();
    for (const responder of responders) {
      result.set(uuidToHex(responder.userId), responder.direction);
    }
    return result;
  }, [responders]);

  const value = React.useMemo(() => ({ directions, responseKind }), [directions, responseKind]);

  return <ClaimCommentPositionContext.Provider value={value}>{children}</ClaimCommentPositionContext.Provider>;
}

/** Current Agree/Disagree or Verify/Dispute state, rendered only inside a claim comment thread. */
export function ClaimCommentPositionBadge({ authorSpaceId }: { authorSpaceId: string }) {
  const context = React.useContext(ClaimCommentPositionContext);
  const direction = context?.directions.get(uuidToHex(authorSpaceId));
  if (!context || !direction) return null;

  const positive = direction === 'positive';

  return (
    <span
      className={cx(
        'inline-flex shrink-0 items-center rounded-xs px-1 py-px text-[0.6875rem] font-medium text-text',
        positive ? 'bg-successTertiary' : 'bg-errorTertiary'
      )}
    >
      {responsePositionLabel(context.responseKind, positive)}
    </span>
  );
}
