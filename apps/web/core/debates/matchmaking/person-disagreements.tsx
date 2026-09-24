'use client';

import * as Popover from '@radix-ui/react-popover';

import * as React from 'react';

import { normId } from '~/core/utils/norm-id';
import { NavUtils } from '~/core/utils/utils';

import { ChevronDownSmall } from '~/design-system/icons/chevron-down-small';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';

import type { ClaimDisagreement } from './disagreement-counts';

export function PersonDisagreements({
  personName,
  disagreements,
  claimNamesById,
  claimNamesLoading,
  popoverPortal,
}: {
  personName: string;
  disagreements: ClaimDisagreement[];
  claimNamesById: ReadonlyMap<string, string | null>;
  claimNamesLoading: boolean;
  popoverPortal: HTMLElement | null;
}) {
  const firstClaimRef = React.useRef<HTMLAnchorElement>(null);
  const count = disagreements.length;
  if (count === 0) return null;

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={`View ${count} ${count === 1 ? 'claim' : 'claims'} you disagree on with ${personName}`}
          className="inline-flex items-center gap-1 whitespace-nowrap text-purple transition-opacity hover:opacity-75 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple"
        >
          <span className="tabular-nums">{count}</span> {count === 1 ? 'disagreement' : 'disagreements'}
          <ChevronDownSmall />
        </button>
      </Popover.Trigger>
      {popoverPortal ? (
        <Popover.Portal container={popoverPortal}>
          <Popover.Content
            side="bottom"
            align="start"
            sideOffset={8}
            collisionPadding={{ top: 52, right: 16, bottom: 16, left: 16 }}
            hideWhenDetached
            aria-label={`Claims you disagree on with ${personName}`}
            onOpenAutoFocus={event => {
              event.preventDefault();
              firstClaimRef.current?.focus();
            }}
            className="z-100 w-[300px] overflow-hidden rounded-lg border border-grey-02 bg-white shadow-lg"
          >
            <p className="px-3 pt-2.5 pb-1.5 text-footnoteMedium text-grey-04">Disagreements with {personName}</p>
            <ul
              aria-label={`Disputed claims with ${personName}`}
              className="m-0 max-h-[320px] list-none overflow-y-auto overscroll-contain p-0"
            >
              {disagreements.map((disagreement, index) => {
                const name = claimNamesById.get(normId(disagreement.claimId));
                return (
                  <li key={`${normId(disagreement.claimId)}:${normId(disagreement.spaceId)}`}>
                    <Link
                      ref={index === 0 ? firstClaimRef : undefined}
                      href={NavUtils.toEntity(disagreement.spaceId, disagreement.claimId)}
                      className="block px-3 py-2 transition-colors duration-75 hover:bg-grey-01 focus-visible:bg-grey-01 focus-visible:outline-none"
                    >
                      <span className="block text-metadataMedium text-text">
                        {name?.trim() || (claimNamesLoading ? 'Loading claim…' : 'Untitled claim')}
                      </span>
                      <span className="mt-0.5 block text-footnote text-grey-04">{opposingSides(disagreement)}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Popover.Content>
        </Popover.Portal>
      ) : null}
    </Popover.Root>
  );
}

function opposingSides(disagreement: ClaimDisagreement): string {
  if (disagreement.responseKind === 'veracity') {
    return disagreement.viewerPosition ? 'You verify · They dispute' : 'You dispute · They verify';
  }
  return disagreement.viewerPosition ? 'You agree · They disagree' : 'You disagree · They agree';
}
