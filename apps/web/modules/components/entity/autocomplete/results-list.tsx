import * as React from 'react';
import cx from 'classnames';
import { SYSTEM_IDS } from '@geogenesis/ids';

import { Breadcrumb } from '~/modules/design-system/breadcrumb';
import { CheckCircleSmall } from '~/modules/design-system/icons/check-circle-small';
import { ChevronDownSmall } from '~/modules/design-system/icons/chevron-down-small';
import { Spacer } from '~/modules/design-system/spacer';
import { Tag } from '~/modules/design-system/tag';
import { Text } from '~/modules/design-system/text';
import { Truncate } from '~/modules/design-system/truncate';
import { Entity, Space } from '~/modules/types';

type ResultsListProps = React.ComponentPropsWithoutRef<'ul'>;

export const ResultsList = (props: ResultsListProps) => (
  <ul
    className="m-0 flex max-h-[340px] list-none flex-col justify-start overflow-y-auto overflow-x-hidden p-0"
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
}

export function ResultContent({ onClick, result, alreadySelected, spaces }: Props) {
  const space = spaces.find(space => space.id === result.nameTripleSpace);

  const spaceImg = space?.attributes[SYSTEM_IDS.IMAGE_ATTRIBUTE] ?? '';
  const spaceName = space?.attributes[SYSTEM_IDS.NAME];

  const showBreadcrumbs = spaceName || result.types.length > 0;
  const showBreadcrumbChevron = spaceName && result.types.length > 0;

  return (
    <ResultItem onClick={onClick} existsOnEntity={Boolean(alreadySelected)}>
      <div className="flex w-full items-center justify-between leading-[1rem]">
        <Text as="li" variant="metadataMedium" ellipsize className="leading-[1.125rem]">
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
      {result.description && (
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
