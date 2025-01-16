'use client';

import { Relation } from '~/design-system/icons/relation';
import { RightArrowLong } from '~/design-system/icons/right-arrow-long';

export type Relationship = {
  from: { name: string; id: string };
  to: { name: string; id: string };
  relationType: { name: string; id: string };
} | null;

type RelationshipHeaderProps = {
  relationship: Relationship;
};

export const RelationshipHeader = ({ relationship }: RelationshipHeaderProps) => {
  if (!relationship) return null;

  return (
    <div className="relative mb-4 mt-4 flex rounded-lg border border-grey-02">
      <div className="flex flex-1 shrink-0 items-center justify-center px-6">
        <span className="truncate text-mediumTitle">{relationship.from.name}</span>
      </div>
      <div className="flex flex-col items-center justify-center gap-0.5 bg-divider px-3 py-4">
        <div className="line-clamp-2 max-w-32 text-metadata">{relationship.relationType.name}</div>
        <div>
          <RightArrowLong />
        </div>
      </div>
      <div className="flex flex-1 shrink-0 items-center justify-center truncate px-6">
        <span className="truncate text-mediumTitle">{relationship.to.name}</span>
      </div>
      <RelationTags />
    </div>
  );
};

const RelationTags = () => {
  return (
    <div className="absolute -bottom-3.5 left-0 flex translate-y-full items-center gap-2">
      <span className="flex h-6 items-center rounded-sm bg-divider px-1.5 text-breadcrumb text-grey-04">
        <Relation />
      </span>
      <span className="flex h-6 items-center rounded-sm bg-divider px-1.5 text-breadcrumb text-grey-04">Relation</span>
    </div>
  );
};
