'use client';

import * as React from 'react';

import { NavUtils } from '~/core/utils/utils';

import { PrefetchLink as Link } from '~/design-system/prefetch-link';

type Props = {
  entityId: string;
  spaceId: string;
  label: string;
};

export function ChatRelationPill({ entityId, spaceId, label }: Props) {
  return (
    <Link
      entityId={entityId}
      spaceId={spaceId}
      href={NavUtils.toEntity(spaceId, entityId)}
      className="inline-flex items-center rounded border border-grey-02 bg-white px-1 py-px align-baseline text-metadataMedium leading-[1.1] font-normal text-text hover:cursor-pointer hover:border-text focus-visible:cursor-pointer focus-visible:border-text focus-visible:bg-ctaTertiary focus-visible:shadow-inner-lg"
    >
      <span>{label}</span>
    </Link>
  );
}
