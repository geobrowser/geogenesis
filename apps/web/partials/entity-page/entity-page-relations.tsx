'use client';

import cx from 'classnames';
import Link from 'next/link';
import pluralize from 'pluralize';

import { useState } from 'react';

import { NavUtils } from '~/core/utils/utils';
import type { Relation } from '~/core/v2.types';

import { CheckCircle } from '~/design-system/icons/check-circle';
import { ChevronUpBig } from '~/design-system/icons/chevron-up-big';
import { RightArrowLong } from '~/design-system/icons/right-arrow-long';
import { ResizableContainer } from '~/design-system/resizable-container';

type EntityPageRelationsProps = {
  relations: Relation[];
  spaceId: string;
};

export const EntityPageRelations = ({ relations, spaceId }: EntityPageRelationsProps) => {
  const [isOpen, setIsOpen] = useState<boolean>(true);

  return (
    <div>
      <button onClick={() => setIsOpen(!isOpen)} className="flex w-full items-center justify-between py-3">
        <div>
          {relations.length} {pluralize('relation', relations.length)}
        </div>
        <div className={cx(isOpen && 'scale-y-[-1]', 'transition-transform duration-300 ease-in-out')}>
          <ChevronUpBig color="text" />
        </div>
      </button>
      <ResizableContainer>
        {isOpen && (
          <div className="divide-y divide-grey-02 border-b border-t border-grey-02">
            {relations.map(relation => (
              <div key={relation.id} className="flex text-smallTitle font-medium leading-none">
                <Link href={NavUtils.toEntity(spaceId, relation.fromEntity.id)} className="flex-1 p-3">
                  {relation.fromEntity.name}
                </Link>
                <Link
                  href={NavUtils.toEntity(relation.spaceId ?? spaceId, relation.type.id)}
                  className="inline-flex flex-1 items-center justify-between bg-grey-01 p-3"
                >
                  <span>{relation.type.name}</span>
                  <RightArrowLong color="text" />
                </Link>
                <Link
                  href={NavUtils.toEntity(relation.spaceId ?? spaceId, relation.toEntity.id)}
                  className="inline-flex flex-1 items-center gap-2 p-3"
                >
                  {relation.toEntity.name}
                  {relation.verified && (
                    <span className="inline-block">
                      <CheckCircle color="text" />
                    </span>
                  )}
                </Link>
              </div>
            ))}
          </div>
        )}
      </ResizableContainer>
    </div>
  );
};
