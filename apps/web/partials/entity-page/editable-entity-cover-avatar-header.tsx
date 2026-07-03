'use client';

import { ContentIds, SystemIds } from '@geoprotocol/geo-sdk/lite';

import { ChangeEvent, useRef, useState } from 'react';

import cx from 'classnames';
import { AnimatePresence, motion } from 'framer-motion';

import { useEditableProperties } from '~/core/hooks/use-renderables';
import { useUserIsEditing } from '~/core/hooks/use-user-is-editing';
import { useEntityStoreInstance } from '~/core/state/entity-page-store/entity-store-provider';
import { useMutate } from '~/core/sync/use-mutate';
import { useRelation } from '~/core/sync/use-store';
import { Relation } from '~/core/types';

import { SquareButton } from '~/design-system/button';
import { Dots } from '~/design-system/dots';
import { GeoImage, NativeGeoImage } from '~/design-system/geo-image';
import { Trash } from '~/design-system/icons/trash';
import { Upload } from '~/design-system/icons/upload';

const COVER_IMAGE_HEIGHT = 320;
const MOBILE_COVER_IMAGE_HEIGHT_CLASS = 'md:!h-[180px]';
const MOBILE_COVER_AVATAR_MARGIN_CLASS = 'md:!mb-16';
const COVER_PLACEHOLDER_HEIGHT = 120;
const AVATAR_OVERFLOW = 40;
const TRANSITION = { duration: 0.15, ease: 'easeInOut' as const };

// The cover renders with `rounded-lg` (--radius-lg in styles.css). Content below it
// insets by 6x that radius on each side's rounded corner pair, so the text column
// reads as sitting just inside the cover's curve instead of floating independently.
export const COVER_MAX_WIDTH = 1192;
export const COVER_BORDER_RADIUS = 12;
export const CONTENT_MAX_WIDTH = COVER_MAX_WIDTH - 6 * COVER_BORDER_RADIUS;

// maxWidth is always COVER_MAX_WIDTH so the wrapper never animates horizontally.
// When there's no cover the extra width is invisible (height is 0 or 40).
function computeLayout(hasCover: boolean, hasCoverImage: boolean, hasAvatar: boolean) {
  return {
    height: hasCover
      ? hasCoverImage
        ? COVER_IMAGE_HEIGHT
        : COVER_PLACEHOLDER_HEIGHT
      : hasAvatar
        ? AVATAR_OVERFLOW
        : 0,
    maxWidth: COVER_MAX_WIDTH,
    marginBottom: hasCover ? (hasAvatar ? 80 : 32) : hasAvatar ? 64 : 0,
    marginTop: hasCover ? -24 : 0,
  };
}

export const EditableCoverAvatarHeader = ({
  avatarUrl,
  coverUrl,
  fitImage = false,
}: {
  avatarUrl: string | null;
  coverUrl: string | null;
  fitImage?: boolean;
}) => {
  const { spaceId, id } = useEntityStoreInstance();
  const editable = useUserIsEditing(spaceId);

  const renderedProperties = useEditableProperties(id, spaceId);

  // In browse mode, derive visibility from the props (server-rendered URLs).
  // In edit mode, use schema-based renderables so placeholders appear even
  // before the user has uploaded an image.
  const coverRenderable = editable ? renderedProperties[SystemIds.COVER_PROPERTY] || coverUrl : coverUrl;
  const showAvatar = editable ? avatarUrl || renderedProperties[ContentIds.AVATAR_PROPERTY] : avatarUrl;

  const hasCover = !!coverRenderable;
  const hasCoverImage = !!coverUrl;
  const hasAvatar = !!showAvatar;

  if (fitImage) {
    if (!hasCoverImage) return null;
    return (
      <div className="relative mx-auto mb-8 w-full">
        <AvatarCoverInput
          entityId={id}
          typeOfId={SystemIds.COVER_PROPERTY}
          inputId="cover-input"
          imgUrl={coverUrl}
          fitImage
        />
      </div>
    );
  }

  const layout = computeLayout(hasCover, hasCoverImage, hasAvatar);
  const coverHeight = hasCoverImage ? COVER_IMAGE_HEIGHT : COVER_PLACEHOLDER_HEIGHT;
  const mobileCoverHeightClass = hasCoverImage ? MOBILE_COVER_IMAGE_HEIGHT_CLASS : '';
  const mobileCoverAvatarMarginClass = hasCoverImage && hasAvatar ? MOBILE_COVER_AVATAR_MARGIN_CLASS : '';

  return (
    <motion.div
      initial={false}
      animate={layout}
      transition={TRANSITION}
      className={`relative mx-auto w-full ${mobileCoverHeightClass} ${mobileCoverAvatarMarginClass}`}
    >
      {/* Cover — fixed size, fades in/out. The inner div clips it via overflow-hidden
          so during the height animation the cover is revealed, not scaled. */}
      <div className="absolute inset-0 overflow-hidden rounded-lg">
        <AnimatePresence initial={false}>
          {hasCover && (
            <motion.div
              key="cover"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={TRANSITION}
              className={`flex items-center justify-center ${mobileCoverHeightClass}`}
              style={{ height: coverHeight, width: '100%' }}
            >
              <AvatarCoverInput
                entityId={id}
                typeOfId={SystemIds.COVER_PROPERTY}
                inputId="cover-input"
                imgUrl={coverUrl}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Avatar — outside the overflow-hidden clip so it's never clipped */}
      <AnimatePresence initial={false}>
        {hasAvatar && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={TRANSITION}
            className="absolute right-0 left-0 mx-auto flex justify-start"
            style={{ bottom: -AVATAR_OVERFLOW, maxWidth: CONTENT_MAX_WIDTH }}
          >
            <div className="flex h-20 w-20 items-center justify-center rounded-lg">
              <AvatarCoverInput
                typeOfId={ContentIds.AVATAR_PROPERTY}
                entityId={id}
                inputId="avatar-input"
                imgUrl={avatarUrl}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

const AvatarCoverInput = ({
  typeOfId,
  inputId,
  entityId,
  imgUrl,
  fitImage = false,
}: {
  typeOfId: string;
  inputId: string;
  entityId: string;
  imgUrl?: string | null;
  fitImage?: boolean;
}) => {
  const [hovered, setHovered] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const { spaceId } = useEntityStoreInstance();

  const fileInputRef = useRef<HTMLInputElement>(null);

  const isCover = typeOfId === SystemIds.COVER_PROPERTY;

  const editable = useUserIsEditing(spaceId);

  const firstRenderable = useRelation({
    selector: r => r.fromEntity.id === entityId && r.type.id === typeOfId && r.spaceId === spaceId,
  });

  const { storage } = useMutate();

  const onImageChange = async (file: File) => {
    const propertyName = isCover ? 'Cover' : 'Avatar';

    try {
      setIsUploading(true);

      // Use the consolidated helper to create and link the image
      await storage.images.createAndLink({
        file,
        fromEntityId: entityId,
        fromEntityName: null,
        relationPropertyId: typeOfId,
        relationPropertyName: propertyName,
        spaceId,
      });
    } catch (error) {
      console.error('Failed to upload image:', error);
    } finally {
      setIsUploading(false);
    }
  };

  const handleChange = async (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const file = e.target.files[0];

      try {
        // Only delete the old image after the new one is successfully uploaded
        if (imgUrl && firstRenderable) {
          deleteRelation(firstRenderable);
        }
        await onImageChange(file);
      } catch (error) {
        console.error('Failed to upload image:', error);
      } finally {
        e.target.value = '';
      }
    }
  };

  const deleteRelation = (renderable: Relation) => {
    if (firstRenderable) {
      storage.relations.delete(renderable);
    }
  };

  const openInput = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  return (
    <>
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={() => {
          if (!imgUrl && editable) openInput();
        }}
        className={
          fitImage
            ? cx('relative w-full rounded-lg', imgUrl && 'bg-transparent', !imgUrl && editable && 'cursor-pointer')
            : cx(
                'relative h-full w-full rounded-lg',
                !imgUrl && editable && 'cursor-pointer',
                isCover
                  ? imgUrl && 'bg-transparent'
                  : imgUrl
                    ? 'relative h-[80px] w-[80px] overflow-hidden rounded-lg border border-white bg-transparent shadow-lg'
                    : 'h-[80px] w-[80px] bg-avatar-default bg-center bg-no-repeat hover:bg-white hover:bg-avatar-hover'
              )
        }
      >
        {/* Cover placeholder — two layers crossfaded via opacity for smooth hover */}
        {isCover && !imgUrl && !fitImage && (
          <>
            <div className="absolute inset-0 rounded-lg bg-cover-default bg-contain bg-center bg-no-repeat" />
            <div
              className="absolute inset-0 rounded-lg bg-cover-hover bg-contain bg-center bg-no-repeat transition-opacity duration-150"
              style={{ opacity: hovered ? 1 : 0 }}
            />
          </>
        )}
        {imgUrl &&
          (fitImage ? (
            <NativeGeoImage
              value={imgUrl}
              alt=""
              className="block h-auto w-full rounded-lg border border-white bg-white"
            />
          ) : (
            <GeoImage
              fill
              value={imgUrl}
              unoptimized={true}
              alt=""
              className="h-full w-full rounded-lg border border-white bg-white object-cover"
            />
          ))}
        {editable && (
          <div
            className={cx(
              'absolute flex transform items-center gap-[6px]',
              imgUrl && isCover ? 'top-4 right-4 justify-end' : 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2'
            )}
          >
            {isUploading ? (
              <SquareButton disabled className="pointer-events-none border-none bg-white/85">
                <Dots color="bg-grey-03" />
              </SquareButton>
            ) : !imgUrl ? (
              <div className="relative">
                <div className="transition-opacity duration-150" style={{ opacity: hovered ? 0 : 1 }}>
                  <Upload color="grey-03" />
                </div>
                <div className="absolute inset-0 transition-opacity duration-150" style={{ opacity: hovered ? 1 : 0 }}>
                  <Upload />
                </div>
              </div>
            ) : (
              hovered && (
                <>
                  <SquareButton onClick={openInput} icon={<Upload />} />

                  <SquareButton
                    onClick={() => (firstRenderable ? deleteRelation(firstRenderable) : undefined)}
                    icon={<Trash />}
                  />
                </>
              )
            )}

            <input
              ref={fileInputRef}
              accept="image/png, image/jpeg"
              id={inputId}
              onChange={handleChange}
              type="file"
              className="hidden"
            />
          </div>
        )}
      </div>
    </>
  );
};
