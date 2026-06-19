'use client';

import * as Dropdown from '@radix-ui/react-dropdown-menu';

import * as React from 'react';

import cx from 'classnames';

import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import { useSpacesByIds } from '~/core/hooks/use-spaces-by-ids';

import { NativeGeoImage } from '~/design-system/geo-image';
import { Check } from '~/design-system/icons/check';
import { ChevronDownSmall } from '~/design-system/icons/chevron-down-small';
import { Text } from '~/design-system/text';

type Props = {
  publishSpaceIds: string[];
  publishSpaceId: string;
  onPublishSpaceIdChange: (spaceId: string) => void;
  disabled?: boolean;
};

function SpaceLabel({ spaceId, name, image }: { spaceId: string; name: string; image: string | null }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <div className="h-4 w-4 shrink-0 overflow-hidden rounded-sm border border-grey-02 bg-grey-01">
        <NativeGeoImage value={image || PLACEHOLDER_SPACE_IMAGE} alt="" className="h-full w-full object-cover" />
      </div>
      <Text variant="metadata" className="min-w-0 truncate text-text">
        {name}
      </Text>
      <span className="sr-only">{spaceId}</span>
    </div>
  );
}

export function RankingComposePublishSpacePicker({
  publishSpaceIds,
  publishSpaceId,
  onPublishSpaceIdChange,
  disabled = false,
}: Props) {
  const { spacesById } = useSpacesByIds(publishSpaceIds);
  const [open, setOpen] = React.useState(false);

  const resolved = publishSpaceIds.map(id => {
    const space = spacesById.get(id);
    return {
      id,
      name: space?.entity?.name?.trim() || 'Space',
      image: space?.entity?.image ?? null,
    };
  });

  const active = resolved.find(s => s.id === publishSpaceId) ?? resolved[0];

  if (!active) {
    return null;
  }

  if (publishSpaceIds.length <= 1 || disabled) {
    return <SpaceLabel spaceId={active.id} name={active.name} image={active.image} />;
  }

  return (
    <Dropdown.Root open={open} onOpenChange={setOpen}>
      <Dropdown.Trigger asChild disabled={disabled}>
        <button
          type="button"
          className={cx(
            'inline-flex max-w-[min(100%,14rem)] items-center gap-1 rounded-md bg-grey-01 px-2 py-1 text-left',
            disabled && 'pointer-events-none opacity-50'
          )}
          aria-label="Choose space to publish in"
        >
          <SpaceLabel spaceId={active.id} name={active.name} image={active.image} />
          <ChevronDownSmall color="grey-04" />
        </button>
      </Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content
          align="start"
          sideOffset={4}
          avoidCollisions
          collisionPadding={8}
          className="z-[250] flex max-h-[min(280px,60vh)] min-w-[12rem] flex-col overflow-y-auto overscroll-contain rounded-md border border-grey-02 bg-white py-1 shadow-dropdown"
        >
          {resolved.map(row => (
            <Dropdown.Item
              key={row.id}
              className="flex shrink-0 cursor-pointer items-center justify-between gap-2 px-3 py-2 text-button outline-none data-highlighted:bg-grey-01"
              onSelect={() => {
                onPublishSpaceIdChange(row.id);
                setOpen(false);
              }}
            >
              <SpaceLabel spaceId={row.id} name={row.name} image={row.image} />
              {row.id === publishSpaceId ? <Check /> : null}
            </Dropdown.Item>
          ))}
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  );
}
