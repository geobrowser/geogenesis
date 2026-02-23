'use client';

import cx from 'classnames';
import Link from 'next/link';
import pluralize from 'pluralize';

import { useState } from 'react';

import { useRelationEntityRelations } from '~/core/state/entity-page-store/entity-store';
import type { Relation } from '~/core/types';
import { NavUtils } from '~/core/utils/utils';

import { CheckCircle } from '~/design-system/icons/check-circle';
import { ChevronUpBig } from '~/design-system/icons/chevron-up-big';
import { Close } from '~/design-system/icons/close';
import { Context } from '~/design-system/icons/context';
import { RightArrowLong } from '~/design-system/icons/right-arrow-long';
import { Menu, MenuItem } from '~/design-system/menu';
import { ResizableContainer } from '~/design-system/resizable-container';

type EntityPageRelationsProps = {
  entityId: string;
  spaceId: string;
  serverRelations: Relation[];
};

export const EntityPageRelations = ({ entityId, spaceId, serverRelations }: EntityPageRelationsProps) => {
  const [isOpen, setIsOpen] = useState<boolean>(true);

  const localRelations = useRelationEntityRelations(entityId, spaceId);
  const mergedRelations = mergeRelations(serverRelations, localRelations);

  if (mergedRelations.length === 0) {
    return null;
  }

  return (
    <div className="mb-4">
      <button onClick={() => setIsOpen(!isOpen)} className="flex w-full items-center justify-between py-3">
        <div>
          {mergedRelations.length} {pluralize('relation', mergedRelations.length)}
        </div>
        <div className={cx(isOpen && 'scale-y-[-1]', 'transition-transform duration-300 ease-in-out')}>
          <ChevronUpBig color="text" />
        </div>
      </button>
      <ResizableContainer>
        {isOpen && (
          <div className="divide-y divide-grey-02 border-t border-b border-grey-02">
            {mergedRelations.map(relation => (
              <Relationship key={relation.id} relation={relation} spaceId={spaceId} />
            ))}
          </div>
        )}
      </ResizableContainer>
    </div>
  );
};

function mergeRelations(serverRelations: Relation[], localRelations: Relation[]): Relation[] {
  const relationsMap = new Map<string, Relation>();

  for (const relation of serverRelations) {
    relationsMap.set(relation.id, relation);
  }

  for (const relation of localRelations) {
    relationsMap.set(relation.id, relation);
  }

  return Array.from(relationsMap.values()).filter(r => !r.isDeleted);
}

type RelationshipProps = {
  relation: Relation;
  spaceId: string;
};

const Relationship = ({ relation, spaceId }: RelationshipProps) => {
  const [isHovered, setIsHovered] = useState<boolean>(false);
  const [isMenuOpen, setIsMenuOpen] = useState<boolean>(false);
  const [hasCopiedId, setHasCopiedId] = useState<boolean>(false);

  const onCopyRelationId = async () => {
    try {
      await navigator.clipboard.writeText(relation.id);
      setHasCopiedId(true);
      setTimeout(() => {
        setHasCopiedId(false);
        setIsMenuOpen(false);
      }, 1500);
    } catch (err) {
      console.error('Failed to copy relation ID: ', relation.id);
    }
  };

  return (
    <div
      key={relation.id}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => {
        setIsHovered(false);
        setIsMenuOpen(false);
      }}
      className="relative flex text-smallTitle leading-none font-medium"
    >
      <div className="flex-1 p-3">
        <Link href={NavUtils.toEntity(spaceId, relation.fromEntity.id)}>{relation.fromEntity.name}</Link>
      </div>
      <Link
        href={NavUtils.toEntity(relation.spaceId ?? spaceId, relation.type.id)}
        className="inline-flex flex-1 items-center justify-between bg-grey-01 p-3"
      >
        <span>{relation.type.name}</span>
        <RightArrowLong color="text" />
      </Link>
      <div className="flex-1 p-3">
        <Link
          href={NavUtils.toEntity(relation.toSpaceId ?? relation.spaceId ?? spaceId, relation.toEntity.id)}
          className="inline-flex items-center gap-2"
        >
          {relation.toEntity.name}
          {relation.verified && (
            <span className="inline-block">
              <CheckCircle color="text" />
            </span>
          )}
        </Link>
      </div>
      {isHovered && (
        <div className="absolute top-0 right-0 bottom-0 inline-flex items-center">
          <Menu
            className="max-w-[160px]"
            open={isMenuOpen}
            onOpenChange={() => setIsMenuOpen(!isMenuOpen)}
            trigger={isMenuOpen ? <Close color="grey-04" /> : <Context color="grey-04" />}
            side="bottom"
          >
            <MenuItem onClick={onCopyRelationId}>
              <span className={cx('absolute', !hasCopiedId && 'invisible')}>Copied!</span>
              <span className={cx(hasCopiedId && 'invisible')}>Copy relation ID</span>
            </MenuItem>
            <MenuItem>
              <div className="flex flex-col">
                <span>Index</span>
                <span className="text-grey-04">{relation.position || 'unset'}</span>
              </div>
            </MenuItem>
          </Menu>
        </div>
      )}
    </div>
  );
};
