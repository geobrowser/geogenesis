import { SYSTEM_IDS } from '@geogenesis/ids';
import cx from 'classnames';

import * as React from 'react';

import { Entity, Space } from '~/core/types';

import { Breadcrumb } from '~/design-system/breadcrumb';
import { CheckCircleSmall } from '~/design-system/icons/check-circle-small';
import { ChevronDownSmall } from '~/design-system/icons/chevron-down-small';
import { Spacer } from '~/design-system/spacer';
import { Tag } from '~/design-system/tag';
import { Text } from '~/design-system/text';
import { Truncate } from '~/design-system/truncate';

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

interface Props {
  onClick: () => void;
  result: Entity;
  alreadySelected?: boolean;
  spaces: Space[];
  withDescription?: boolean;
}

export function ResultContent({ onClick, result, alreadySelected, spaces, withDescription = true }: Props) {
  const duplicates = spaces.filter(space => space.id === result.name);
  console.log('duplicates', duplicates);

  const space = spaces.find(space => space.id === result.nameTripleSpaces?.[0] ?? '');

  const spaceName = space?.spaceConfig?.name ?? space?.id ?? '';
  const spaceImg = space?.spaceConfig?.image ?? null;

  const showBreadcrumbs = spaceName || result.types.length > 0;
  const showBreadcrumbChevron = spaceName && result.types.length > 0;

  const onSelect = () => {
    if (alreadySelected) return;
    onClick();
  };

  return (
    <ResultItem onClick={onSelect} existsOnEntity={Boolean(alreadySelected)}>
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
                {result.types.map(type => (
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
    </ResultItem>
  );
}
