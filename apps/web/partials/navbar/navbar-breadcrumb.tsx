'use client';

import * as Popover from '@radix-ui/react-popover';
import cx from 'classnames';
import { AnimatePresence, motion } from 'framer-motion';

import { useState } from 'react';

import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import { useEntity } from '~/core/database/entities';
import { useSpace } from '~/core/hooks/use-space';
import { useSpacesByIds } from '~/core/hooks/use-spaces-by-ids';
import { compareBySpaceRank } from '~/core/utils/space/space-ranking';
import { NavUtils } from '~/core/utils/utils';

import { Divider } from '~/design-system/divider';
import { GeoImage } from '~/design-system/geo-image';
import { Check } from '~/design-system/icons/check';
import { ChevronDownSmall } from '~/design-system/icons/chevron-down-small';
import { Input } from '~/design-system/input';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { Text } from '~/design-system/text';

type NavbarBreadcrumbProps = {
  spaceId: string;
  entityId?: string;
};

const MotionContent = motion.create(Popover.Content);

export function NavbarBreadcrumb({ spaceId, entityId }: NavbarBreadcrumbProps) {
  if (!entityId) return <SpaceBreadcrumb spaceId={spaceId} />;

  return <EntityBreadcrumb spaceId={spaceId} entityId={entityId} />;
}

type SpaceBreadcrumbProps = {
  spaceId: string;
};

const SpaceBreadcrumb = ({ spaceId }: SpaceBreadcrumbProps) => {
  const { space, isLoading } = useSpace(spaceId);

  if (isLoading || !space || !space.entity) {
    return null;
  }

  const spaceName = space.entity.name ?? '';
  const spaceImage = space.entity.image;

  return (
    <Link href={NavUtils.toSpace(spaceId)} className="flex items-center justify-center gap-1.5">
      <div className="relative h-4 w-4 overflow-hidden rounded-sm">
        <GeoImage value={spaceImage || PLACEHOLDER_SPACE_IMAGE} alt="" priority style={{ objectFit: 'cover' }} fill />
      </div>
      <Divider type="vertical" className="inline-block h-4 w-px" />
      <div className="truncate sm:max-w-[20ch]">
        <Text variant="button" className="hover:text-text!">
          {spaceName.slice(0, 48) + (spaceName.length > 48 ? '...' : '')}
        </Text>
      </div>
    </Link>
  );
};

type EntityBreadcrumbProps = {
  spaceId: string;
  entityId: string;
};

const EntityBreadcrumb = ({ spaceId, entityId }: EntityBreadcrumbProps) => {
  const [open, setOpen] = useState<boolean>(false);
  const [query, setQuery] = useState<string>('');

  const { space, isLoading } = useSpace(spaceId);

  const entity = useEntity({ id: entityId });
  const { spaces } = useSpacesByIds(entity?.spaces);

  if (isLoading || !space || !space.entity) {
    return null;
  }

  const spaceName = space.entity.name ?? '';
  const spaceImage = space.entity.image;

  const otherSpaces = spaces
    .filter(space => spaceId !== space.id && (entity?.spaces ?? []).includes(space.id) && space.entity.name?.trim())
    .sort(compareBySpaceRank(s => s.id));

  const formattedQuery = query.trim().toLowerCase();

  const renderedSpaces = !query
    ? otherSpaces
    : otherSpaces.filter(space => space.entity.name?.toLowerCase().startsWith(formattedQuery));

  const showCurrentSpace = space.entity.name?.toLowerCase().startsWith(formattedQuery);

  if (!entity || otherSpaces.length < 1) {
    return (
      <Link href={NavUtils.toSpace(spaceId)} className="flex items-center justify-center gap-1.5">
        <div className="relative h-4 w-4 overflow-hidden rounded-sm">
          <GeoImage value={spaceImage || PLACEHOLDER_SPACE_IMAGE} alt="" priority style={{ objectFit: 'cover' }} fill />
        </div>
        <Divider type="vertical" className="inline-block h-4 w-px" />
        <div className="truncate sm:max-w-[20ch]">
          <Text variant="button" className="hover:text-text!">
            {spaceName.slice(0, 48) + (spaceName.length > 48 ? '...' : '')}
          </Text>
        </div>
      </Link>
    );
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <div className="inline-flex items-center justify-center gap-1.5 rounded-md border border-grey-02 px-1.5">
        <Link href={NavUtils.toSpace(spaceId)} className="relative h-4 w-4 overflow-hidden rounded-sm">
          <GeoImage value={spaceImage || PLACEHOLDER_SPACE_IMAGE} alt="" priority style={{ objectFit: 'cover' }} fill />
        </Link>
        <Divider type="vertical" className="inline-block h-4 w-px" />
        <Popover.Trigger className="flex items-center gap-1.5">
          <div className="truncate sm:max-w-[20ch]">
            <Text variant="button" className="hover:text-text!">
              {shorten(spaceName)}
            </Text>
          </div>
          <div className={cx('transition duration-150 ease-in-out', open && 'scale-y-[-1]')}>
            <ChevronDownSmall color="grey-03" />
          </div>
        </Popover.Trigger>
      </div>
      <AnimatePresence mode="popLayout">
        <MotionContent
          key="entity-view-space-toggle-content"
          side="bottom"
          align="start"
          avoidCollisions
          initial={{ opacity: 0, y: 10, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, y: 10, scale: 0.95 }}
          transition={{ type: 'tween', ease: 'easeInOut', duration: 0.15, opacity: { duration: 0.125 } }}
          className="relative top-1.5 z-100 w-[284px] origin-top-left rounded-md border border-grey-02 bg-white p-1"
          onOpenAutoFocus={event => event.preventDefault()}
        >
          <div>
            <div className="p-1 text-smallButton text-grey-04">View entity in</div>
            <div className="flex flex-col gap-1">
              <Input value={query} onChange={event => setQuery(event.target.value)} withSearchIcon autoFocus={false} />
              {showCurrentSpace && (
                <div className="flex items-center gap-2 rounded-md bg-grey-01 p-2">
                  <div className="relative h-4 w-4 overflow-hidden rounded-sm">
                    <GeoImage
                      value={spaceImage || PLACEHOLDER_SPACE_IMAGE}
                      alt=""
                      priority
                      style={{ objectFit: 'cover' }}
                      fill
                    />
                  </div>
                  <div className="truncate">
                    <Text variant="button" className="hover:text-text!">
                      {spaceName}
                    </Text>
                  </div>
                  <div className="flex grow items-center justify-end">
                    <Check color="grey-04" />
                  </div>
                </div>
              )}
              {renderedSpaces.map(space => {
                const spaceId = space.id;
                const spaceName = space.entity.name ?? '';
                const spaceImage = space.entity.image;

                return (
                  <Link
                    key={spaceId}
                    href={NavUtils.toEntity(spaceId, entityId)}
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-2 rounded-md p-2 hover:bg-grey-01"
                  >
                    <div className="relative h-4 w-4 overflow-hidden rounded-sm">
                      <GeoImage
                        value={spaceImage || PLACEHOLDER_SPACE_IMAGE}
                        alt=""
                        priority
                        style={{ objectFit: 'cover' }}
                        fill
                      />
                    </div>
                    <div className="truncate">
                      <Text variant="button" className="hover:text-text!">
                        {spaceName}
                      </Text>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </MotionContent>
      </AnimatePresence>
    </Popover.Root>
  );
};

const shorten = (value: string): string => value.slice(0, 48) + (value.length > 48 ? '...' : '');
