'use client';

import * as Popover from '@radix-ui/react-popover';
import { cva } from 'class-variance-authority';

import * as React from 'react';
import { useState } from 'react';

import { useSpace } from '~/core/hooks/use-space';
import { useVideoWithFallback } from '~/core/hooks/use-video-with-fallback';
import { EntityId } from '~/core/io/substream-schema';
import { NavUtils } from '~/core/utils/utils';

import { Dots } from '~/design-system/dots';
import { GeoImage } from '~/design-system/geo-image';
import { CheckCircle } from '~/design-system/icons/check-circle';
import { CheckCloseSmall } from '~/design-system/icons/check-close-small';
import { Create as CreateIcon } from '~/design-system/icons/create';
import { Image as ImageIcon } from '~/design-system/icons/image';
import { RelationSmall } from '~/design-system/icons/relation-small';
import { TopRanked } from '~/design-system/icons/top-ranked';
import { VideoSmall as VideoSmallIcon } from '~/design-system/icons/video-small';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { SelectSpaceAsPopover } from '~/design-system/select-space-dialog';
import { ColorName, colors } from '~/design-system/theme/colors';

type LinkableChipProps = {
  href: string;
  children: React.ReactNode;
};

const linkableChipStyles = cva(
  'inline-flex break-words rounded border border-grey-02 bg-white px-1.5 py-1 text-left text-metadataMedium !font-normal !leading-[1.125rem] hover:cursor-pointer hover:border-text hover:text-text focus:cursor-pointer focus:border-text focus:bg-ctaTertiary focus:text-text focus:shadow-inner-lg',
  {
    variants: {
      shouldClamp: {
        false: 'items-center',
        true: 'line-clamp-4',
      },
    },
    defaultVariants: {
      shouldClamp: false,
    },
  }
);

export function LinkableChip({ href, children }: LinkableChipProps) {
  return (
    <Link
      href={href}
      className={linkableChipStyles({ shouldClamp: typeof children === 'string' && children.length >= 42 })}
    >
      <span>{children}</span>
    </Link>
  );
}

type LinkableRelationChipProps = {
  isEditing: boolean;

  currentSpaceId: string;
  entityId: string;
  spaceId?: string;
  relationEntityId?: string;
  relationId?: string;
  verified?: boolean;

  onDelete?: () => void;
  onDone?: (result: { id: string; name: string | null; space?: string; verified?: boolean }) => void;
  small?: boolean;
  className?: string;
  disableLink?: boolean;
  children: React.ReactNode;
};

const linkableRelationChipStyles = cva(
  'group inline-flex items-center break-words rounded border border-grey-02 bg-white pl-1.5 text-metadata tabular-nums hover:cursor-pointer hover:border-text hover:text-text focus:cursor-pointer focus:border-text focus:bg-ctaTertiary focus:text-text focus:shadow-inner-lg',
  {
    variants: {
      shouldClamp: {
        false: 'items-center',
        true: 'line-clamp-4 items-start',
      },
      isDotsHovered: {
        true: '!border-grey-02',
      },
      isSpaceHovered: {
        true: '!border-text !text-text',
      },
      isRelationHovered: {
        true: '!border-text !text-text',
      },
      isDeleteHovered: {
        true: '!border-text !text-text',
      },
      small: {
        true: 'py-px',
        false: 'py-0.5',
      },
    },
    defaultVariants: {
      shouldClamp: false,
      isDotsHovered: false,
      isSpaceHovered: false,
      isRelationHovered: false,
      isDeleteHovered: false,
    },
  }
);

const relationChipDeleteIconStyles = cva('p-1 text-grey-04', {
  variants: {
    isRelationHovered: {
      true: '!text-grey-03',
    },
    isDeleteHovered: {
      true: '!text-text',
    },
  },
  defaultVariants: {
    isRelationHovered: false,
    isDeleteHovered: false,
  },
});

const relationChipRelationIconStyles = cva('p-1 text-grey-04', {
  variants: {
    isRelationHovered: {
      true: '!text-text',
    },
    isDeleteHovered: {
      true: '!text-grey-03',
    },
  },

  defaultVariants: {
    isRelationHovered: false,
    isDeleteHovered: false,
  },
});

const relationChipPopoverTriggerStyles = cva(
  'relative flex items-start px-1.5 py-1 text-grey-03 focus-within:text-text group-hover:text-text',
  {
    variants: {
      isSpaceHovered: {
        true: '!text-text',
      },
      isDeleteHovered: {
        true: '!text-text',
      },
      isRelationHovered: {
        true: '!text-text',
      },
    },
    defaultVariants: {
      isSpaceHovered: false,
      isDeleteHovered: false,
      isRelationHovered: false,
    },
  }
);

export function LinkableRelationChip({
  isEditing,
  currentSpaceId,
  entityId,
  spaceId,
  relationEntityId,
  relationId,
  verified,
  onDelete,
  onDone,
  small = false,
  className = '',
  disableLink = false,
  children,
}: LinkableRelationChipProps) {
  const [isDotsHovered, setIsDotsHovered] = useState<boolean>(false);
  const [isSpaceHovered, setIsSpaceHovered] = useState<boolean>(false);
  const [isRelationHovered, setIsRelationHovered] = useState<boolean>(false);
  const [isDeleteHovered, setIsDeleteHovered] = useState<boolean>(false);

  const [isPopoverOpen, setIsPopoverOpen] = useState<boolean>(false);

  const shouldClamp = typeof children === 'string' && children.length >= 42;

  const { space } = useSpace(spaceId);

  return (
    <div
      onMouseLeave={() => setIsPopoverOpen(false)}
      className={linkableRelationChipStyles({
        shouldClamp,
        isDotsHovered,
        isSpaceHovered,
        isRelationHovered,
        isDeleteHovered,
        small,
        className,
      })}
    >
      {disableLink ? (
        <span>{children}</span>
      ) : (
        <Link
          entityId={entityId}
          spaceId={spaceId ?? currentSpaceId}
          href={NavUtils.toEntity(spaceId ?? currentSpaceId, entityId)}
        >
          {children}
        </Link>
      )}
      {verified && (
        <span className="inline-block pl-1.5">
          <CheckCircle color="current" />
        </span>
      )}
      <Popover.Root open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
        <Popover.Trigger asChild>
          <button
            onMouseEnter={() => {
              setIsPopoverOpen(true);
              setIsDotsHovered(true);
            }}
            onMouseLeave={() => setIsDotsHovered(false)}
            className={relationChipPopoverTriggerStyles({
              isSpaceHovered,
              isDeleteHovered,
              isRelationHovered,
            })}
          >
            {/* Expands hoverable area */}
            <div className="absolute -top-2 bottom-0 left-0 right-0" />
            <RelationDots color="current" />
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            side="top"
            sideOffset={-4}
            className="z-100 flex items-center rounded-[7px] border border-grey-04 bg-white hover:bg-divider"
          >
            {isEditing && (
              <div
                className="-mt-1 inline-block"
                onMouseEnter={() => setIsSpaceHovered(true)}
                onMouseLeave={() => setIsSpaceHovered(false)}
              >
                <SelectSpaceAsPopover
                  entityId={EntityId(entityId)}
                  spaceId={spaceId}
                  verified={verified}
                  onDone={result => {
                    if (!relationId || !onDone) return;
                    onDone(result);
                  }}
                  trigger={
                    <button className="inline-flex items-center p-1">
                      <span className="inline-flex size-[12px] items-center justify-center rounded-sm border hover:!border-text hover:!text-text group-hover:border-grey-03 group-hover:text-grey-03">
                        {space ? (
                          <div className="size-[8px] overflow-clip rounded-sm grayscale">
                            <GeoImage fill value={space.entity.image} alt="" />
                          </div>
                        ) : (
                          <TopRanked />
                        )}
                      </span>
                    </button>
                  }
                />
              </div>
            )}
            {relationEntityId && (
              <Link
                entityId={relationEntityId}
                spaceId={currentSpaceId}
                href={NavUtils.toEntity(currentSpaceId, relationEntityId)}
                onMouseEnter={() => setIsRelationHovered(true)}
                onMouseLeave={() => setIsRelationHovered(false)}
                className={relationChipRelationIconStyles({ isRelationHovered, isDeleteHovered })}
              >
                <RelationSmall />
              </Link>
            )}
            {isEditing && (
              <button
                onClick={onDelete}
                className={relationChipDeleteIconStyles({ isRelationHovered, isDeleteHovered })}
                onMouseEnter={() => setIsDeleteHovered(true)}
                onMouseLeave={() => setIsDeleteHovered(false)}
              >
                <CheckCloseSmall />
              </button>
            )}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}

type RelationDotsProps = {
  color?: ColorName;
  fill?: ColorName;
};

function RelationDots({ color }: RelationDotsProps) {
  const themeColor = color ? colors.light[color] : 'currentColor';

  return (
    <svg width="2" height="6" viewBox="0 0 2 6" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="1" cy="1" r="1" fill={themeColor} />
      <circle cx="1" cy="5" r="1" fill={themeColor} />
    </svg>
  );
}

type LinkableMediaChipProps = {
  isEditing: boolean;
  mediaType: 'IMAGE' | 'VIDEO';
  mediaSrc?: string;
  isUploading?: boolean;

  currentSpaceId: string;
  entityId: string;
  spaceId?: string;
  relationEntityId?: string;
  relationId?: string;
  verified?: boolean;

  onDelete?: () => void;
  onDone?: (result: { id: string; name: string | null; space?: string; verified?: boolean }) => void;
  onUpload?: () => void;
};

const linkableMediaChipStyles = cva(
  'group relative inline-block overflow-hidden rounded-lg border border-grey-02 bg-white hover:cursor-pointer hover:border-text focus:cursor-pointer focus:border-text focus:shadow-inner-lg',
  {
    variants: {
      isPopoverOpen: {
        true: '!border-text',
      },
      isSpaceHovered: {
        true: '!border-text',
      },
      isRelationHovered: {
        true: '!border-text',
      },
      isDeleteHovered: {
        true: '!border-text',
      },
    },
    defaultVariants: {
      isPopoverOpen: false,
      isSpaceHovered: false,
      isRelationHovered: false,
      isDeleteHovered: false,
    },
  }
);

export function LinkableMediaChip({
  isEditing,
  mediaType,
  mediaSrc,
  isUploading,
  currentSpaceId,
  entityId,
  spaceId,
  relationEntityId,
  relationId,
  verified,
  onDelete,
  onDone,
  onUpload,
}: LinkableMediaChipProps) {
  const [isSpaceHovered, setIsSpaceHovered] = useState<boolean>(false);
  const [isRelationHovered, setIsRelationHovered] = useState<boolean>(false);
  const [isDeleteHovered, setIsDeleteHovered] = useState<boolean>(false);
  const [isPopoverOpen, setIsPopoverOpen] = useState<boolean>(false);

  const { space } = useSpace(spaceId);

  // For videos, use the video fallback hook to get the correct URL
  const { src: videoSrc, onError: onVideoError } = useVideoWithFallback(mediaType === 'VIDEO' ? mediaSrc : undefined);

  return (
    <div
      onMouseLeave={() => setIsPopoverOpen(false)}
      className={linkableMediaChipStyles({
        isPopoverOpen,
        isSpaceHovered,
        isRelationHovered,
        isDeleteHovered,
      })}
    >
      {/* Media content with link to entity */}
      <Link
        entityId={entityId}
        spaceId={spaceId ?? currentSpaceId}
        href={NavUtils.toEntity(spaceId ?? currentSpaceId, entityId)}
        className="block"
      >
        <div className="relative h-20 w-20">
          {mediaType === 'VIDEO' ? (
            videoSrc ? (
              <video
                src={videoSrc}
                onError={onVideoError}
                className="h-full w-full rounded-lg object-cover"
                muted
                playsInline
                preload="metadata"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-grey-01">
                <VideoSmallIcon color="grey-04" />
              </div>
            )
          ) : mediaSrc ? (
            <GeoImage fill value={mediaSrc} alt="" className="object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-grey-01">
              <ImageIcon color="grey-04" />
            </div>
          )}
        </div>
      </Link>

      {/* Upload button overlay - only in edit mode */}
      {isEditing && onUpload && !isUploading && (
        <button
          onClick={e => {
            e.stopPropagation();
            onUpload();
          }}
          className="shadow-sm absolute bottom-1 right-1 flex h-5 w-5 items-center justify-center rounded bg-white/90 transition-colors hover:bg-white"
        >
          <CreateIcon color="grey-04" className="h-3 w-3" />
        </button>
      )}

      {/* Uploading indicator overlay */}
      {isUploading && (
        <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-white/80">
          <Dots />
        </div>
      )}

      {/* Verified badge */}
      {verified && (
        <span className="absolute left-1 top-1">
          <CheckCircle color="text" />
        </span>
      )}

      {/* Popover trigger and menu */}
      <Popover.Root open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
        <Popover.Trigger asChild>
          <button
            onMouseEnter={() => setIsPopoverOpen(true)}
            className="shadow-sm absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded bg-white/90 text-grey-03 opacity-0 transition-opacity group-hover:opacity-100"
          >
            <RelationDots color="grey-04" />
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            side="top"
            sideOffset={4}
            className="z-100 flex items-center rounded-[7px] border border-grey-04 bg-white hover:bg-divider"
          >
            {isEditing && (
              <div
                className="-mt-1 inline-block"
                onMouseEnter={() => setIsSpaceHovered(true)}
                onMouseLeave={() => setIsSpaceHovered(false)}
              >
                <SelectSpaceAsPopover
                  entityId={EntityId(entityId)}
                  spaceId={spaceId}
                  verified={verified}
                  onDone={result => {
                    if (!relationId || !onDone) return;
                    onDone(result);
                  }}
                  trigger={
                    <button className="inline-flex items-center p-1">
                      <span className="inline-flex size-[12px] items-center justify-center rounded-sm border hover:!border-text hover:!text-text group-hover:border-grey-03 group-hover:text-grey-03">
                        {space ? (
                          <div className="size-[8px] overflow-clip rounded-sm grayscale">
                            <GeoImage fill value={space.entity.image} alt="" />
                          </div>
                        ) : (
                          <TopRanked />
                        )}
                      </span>
                    </button>
                  }
                />
              </div>
            )}
            {relationEntityId && (
              <Link
                entityId={relationEntityId}
                spaceId={currentSpaceId}
                href={NavUtils.toEntity(currentSpaceId, relationEntityId)}
                onMouseEnter={() => setIsRelationHovered(true)}
                onMouseLeave={() => setIsRelationHovered(false)}
                className={relationChipRelationIconStyles({ isRelationHovered, isDeleteHovered })}
              >
                <RelationSmall />
              </Link>
            )}
            {isEditing && (
              <button
                onClick={onDelete}
                className={relationChipDeleteIconStyles({ isRelationHovered, isDeleteHovered })}
                onMouseEnter={() => setIsDeleteHovered(true)}
                onMouseLeave={() => setIsDeleteHovered(false)}
              >
                <CheckCloseSmall />
              </button>
            )}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}
