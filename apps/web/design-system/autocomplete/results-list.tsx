'use client';

import cx from 'classnames';

import * as React from 'react';

import { useEntity } from '~/core/database/entities';
import { SearchResult, SpaceEntity } from '~/core/v2.types';

import { Breadcrumb } from '~/design-system/breadcrumb';
import { NativeGeoImage } from '~/design-system/geo-image';
import { CheckCircleSmall } from '~/design-system/icons/check-circle-small';
import { ChevronDownSmall } from '~/design-system/icons/chevron-down-small';
import { Spacer } from '~/design-system/spacer';
import { Tag } from '~/design-system/tag';
import { Text } from '~/design-system/text';
import { Truncate } from '~/design-system/truncate';

import { RightArrowLong } from '../icons/right-arrow-long';

type ResultsListProps = React.ComponentPropsWithoutRef<'ul'>;

export const ResultsList = (props: ResultsListProps) => (
  <ul
    className="m-0 flex max-h-[340px] list-none flex-col justify-start overflow-y-auto overflow-x-hidden"
    {...props}
  />
);

type ResultItemProps = React.ComponentPropsWithoutRef<'button'> & { existsOnEntity?: boolean };

export const ResultItem = ({ existsOnEntity = false, className = '', ...rest }: ResultItemProps) => (
  <button
    className={cx(
      existsOnEntity ? 'cursor-not-allowed bg-grey-01' : 'cursor-pointer',
      'flex w-full flex-col p-2 hover:bg-grey-01 focus:bg-grey-01 focus:outline-none aria-selected:bg-grey-02',
      className
    )}
    {...rest}
  />
);

type ResultContentProps = {
  onClick: () => void;
  result: SearchResult;
  alreadySelected?: boolean;
  onChooseSpace?: () => void;
  withDescription?: boolean;
  active?: boolean;
} & React.ComponentPropsWithoutRef<'button'>;

export const ResultContent = ({
  onClick,
  result,
  active = false,
  alreadySelected = false,
  withDescription = true,
  onChooseSpace,
  ...rest
}: ResultContentProps) => {
  const [space, ...otherSpaces] = result.spaces;

  if (!space) return null;

  const spaceName = space.name;
  const spaceImg = space.image;
  const hasOtherSpaces = otherSpaces?.length > 0;

  const showBreadcrumbs = spaceName || result.types.length > 0;
  const showBreadcrumbChevron = spaceName && result.types.length > 0;

  const onSelect = () => {
    if (alreadySelected) return;
    onClick();
  };

  return (
    <div>
      <button
        onClick={onSelect}
        className={cx(
          active && 'bg-grey-01',
          alreadySelected ? 'cursor-not-allowed bg-grey-01' : 'cursor-pointer',
          'flex w-full flex-col p-2 transition-colors duration-150 hover:bg-grey-01 focus:bg-grey-01 focus:outline-none'
        )}
        {...rest}
      >
        <div className="flex w-full items-center justify-between leading-[1rem]">
          <Text variant="metadataMedium" ellipsize className="leading-[1.125rem]">
            {result.name ?? result.id}
          </Text>
          {alreadySelected && <CheckCircleSmall color="grey-04" />}
        </div>
        {showBreadcrumbs && (
          <>
            <Spacer height={4} />
            <div className="flex items-center gap-1.5 overflow-hidden">
              {spaceName && <Breadcrumb img={spaceImg}>{spaceName}</Breadcrumb>}
              {showBreadcrumbChevron && (
                <span style={{ rotate: '270deg' }}>
                  <ChevronDownSmall color="grey-04" />
                </span>
              )}
              {result.types.length > 0 && (
                <div className="flex items-center gap-1.5">
                  {result.types
                    .filter((type, index, self) => self.findIndex(t => t.id === type.id) === index)
                    .map(type => (
                      <Tag key={type.id}>{type.name}</Tag>
                    ))}
                </div>
              )}
            </div>
          </>
        )}
        {withDescription && result.description && (
          <>
            <Spacer height={4} />
            <Truncate maxLines={3} shouldTruncate variant="footnote">
              <Text variant="footnote">{result.description}</Text>
            </Truncate>
          </>
        )}
      </button>
      {hasOtherSpaces && !!onChooseSpace && (
        <button
          onClick={e => {
            e.stopPropagation();
            onChooseSpace();
          }}
          className="-mt-2 flex w-full items-center justify-between p-2 transition-colors duration-150 hover:bg-grey-01"
        >
          <div className="flex items-center">
            {otherSpaces.slice(0, 3).map(space => (
              <div
                key={space.spaceId}
                className="-ml-[4px] h-[14px] w-[14px] overflow-clip rounded-sm border border-white first:ml-0"
              >
                <NativeGeoImage value={space.image} alt="" className="h-full w-full object-cover" />
              </div>
            ))}
            <div className="ml-1 text-footnoteMedium text-grey-04">+ {otherSpaces.length} spaces</div>
          </div>
          <div className="size-[12px] *:size-[12px]">
            <RightArrowLong color="grey-04" />
          </div>
        </button>
      )}
    </div>
  );
};

type SpaceContentProps = {
  onClick: () => void;
  entityId: string;
  space: SpaceEntity;
  alreadySelected?: boolean;
  withDescription?: boolean;
};

export const SpaceContent = ({
  onClick,
  entityId,
  space,
  alreadySelected,
  withDescription = true,
}: SpaceContentProps) => {
  const entity = useEntity({ id: entityId, spaceId: space.spaceId });

  const spaceName = space.name ?? space.spaceId ?? '';
  const spaceImg = space.image ?? null;

  const showBreadcrumbs = spaceName || entity.types.length > 0;
  const showBreadcrumbChevron = spaceName && entity.types.length > 0;

  const onSelect = () => {
    if (alreadySelected) return;
    onClick();
  };

  return (
    <div>
      <button
        onClick={onSelect}
        className={cx(
          alreadySelected ? 'cursor-not-allowed bg-grey-01' : 'cursor-pointer',
          'flex w-full flex-col p-2 transition-colors duration-150 hover:bg-grey-01 focus:bg-grey-01 focus:outline-none'
        )}
      >
        <div className="flex w-full items-center justify-between leading-[1rem]">
          <Text variant="metadataMedium" ellipsize className="leading-[1.125rem]">
            {entity.name ?? entity.id}
          </Text>
          {alreadySelected && <CheckCircleSmall color="grey-04" />}
        </div>
        {showBreadcrumbs && (
          <>
            <Spacer height={4} />
            <div className="flex items-center gap-1.5 overflow-hidden">
              {spaceName && <Breadcrumb img={spaceImg}>{spaceName}</Breadcrumb>}
              {showBreadcrumbChevron && (
                <span style={{ rotate: '270deg' }}>
                  <ChevronDownSmall color="grey-04" />
                </span>
              )}
              {entity.types.length > 0 && (
                <div className="flex items-center gap-1.5">
                  {entity.types
                    .filter((type, index, self) => self.findIndex(t => t.id === type.id) === index)
                    .map(type => (
                      <Tag key={type.id}>{type.name}</Tag>
                    ))}
                </div>
              )}
            </div>
          </>
        )}
        {withDescription && entity.description && (
          <>
            <Spacer height={4} />
            <Truncate maxLines={3} shouldTruncate variant="footnote">
              <Text variant="footnote">{entity.description}</Text>
            </Truncate>
          </>
        )}
      </button>
    </div>
  );
};
