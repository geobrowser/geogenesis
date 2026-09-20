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

import {
  ENTITY_PAGE_CONTENT_MAX_WIDTH,
  ENTITY_PAGE_COVER_MAX_WIDTH,
  ENTITY_PAGE_WIDTH_VARIABLES,
  ENTITY_PAGE_WITH_SIDEBAR_MAX_WIDTH,
} from './entity-page-layout';

const COVER_IMAGE_HEIGHT = 320;
const MOBILE_COVER_IMAGE_HEIGHT_CLASS = 'md:!h-[180px]';
const MOBILE_COVER_AVATAR_MARGIN_CLASS = 'md:!mb-16';
const COVER_PLACEHOLDER_HEIGHT = 120;
const AVATAR_OVERFLOW = 40;
const TRANSITION = { duration: 0.15, ease: 'easeInOut' as const };

// maxWidth is always ENTITY_PAGE_COVER_MAX_WIDTH so the wrapper never animates horizontally.
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
    maxWidth: ENTITY_PAGE_COVER_MAX_WIDTH,
    marginBottom: hasCover ? (hasAvatar ? 80 : 32) : hasAvatar ? 64 : 0,
    marginTop: hasCover ? -24 : 0,
  };
}

export const EditableCoverAvatarHeader = ({
  avatarUrl,
  contentMaxWidth = ENTITY_PAGE_CONTENT_MAX_WIDTH,
  coverUrl,
  fitImage = false,
  withAvatar = false,
  contentInsetClassName,
}: {
  avatarUrl: string | null;
  /**
   * How wide the text column under this header is, so the avatar can line up
   * with it. Defaults to the ordinary page width; a surface that renders a rail
   * — a profile — passes the wider with-sidebar width instead.
   */
  contentMaxWidth?: number;
  /** Responsive inline padding inside the aligned content column. */
  contentInsetClassName?: string;
  coverUrl: string | null;
  fitImage?: boolean;
  /** Whether the fitted header shows the avatar too — see the `fitImage` branch. */
  withAvatar?: boolean;
}) => {
  const { spaceId, id } = useEntityStoreInstance();
  const editable = useUserIsEditing(spaceId);

  // A profile's column is 1142 wide and narrows to 900 where the rail drops
  // itself, so the avatar's box has to follow it rather than sit at one width.
  const isWideColumn = contentMaxWidth === ENTITY_PAGE_WITH_SIDEBAR_MAX_WIDTH;

  const renderedProperties = useEditableProperties(id, spaceId);

  // In browse mode, derive visibility from the props (server-rendered URLs).
  // In edit mode, use schema-based renderables so placeholders appear even
  // before the user has uploaded an image.
  const coverRenderable = editable ? renderedProperties[SystemIds.COVER_PROPERTY] || coverUrl : coverUrl;
  const showAvatar = editable ? avatarUrl || renderedProperties[ContentIds.AVATAR_PROPERTY] : avatarUrl;

  const hasCover = !!coverRenderable;
  const hasCoverImage = !!coverUrl;
  const hasAvatar = !!showAvatar;

  /*
   * The fitted header: a cover sized to the column it is in rather than cropped
   * to a fixed height. The side panel uses it.
   *
   * `withAvatar` is off by default and that is deliberate. This branch drew the
   * cover alone, which is right for most entities — an entity's avatar is a
   * thumbnail for lists, and a panel that is already showing the thing itself
   * has no use for one. A *person* is the exception the rule cannot survive: the
   * avatar is their face, and a profile that opens without it is missing the one
   * thing a reader recognises. So the caller says.
   */
  if (fitImage) {
    if (!hasCoverImage && !(withAvatar && hasAvatar)) return null;

    return (
      <div className={cx('@container relative mx-auto w-full', withAvatar && hasAvatar ? 'mb-14' : 'mb-8')}>
        {hasCoverImage && (
          <AvatarCoverInput
            entityId={id}
            typeOfId={SystemIds.COVER_PROPERTY}
            inputId="cover-input"
            imgUrl={coverUrl}
            fitImage
          />
        )}
        {withAvatar && hasAvatar && (
          <div
            // Overhanging the cover's bottom-left by the same 40px the full
            // header uses, so a profile reads the same in the panel as on its
            // page. Aligned to this container rather than to a text column:
            // the panel has one width, so the cover and the name below it
            // already start in the same place.
            className={cx('flex justify-start', contentInsetClassName, hasCoverImage && 'absolute left-0')}
            style={hasCoverImage ? { bottom: -AVATAR_OVERFLOW } : undefined}
          >
            <div className="flex h-20 w-20 items-center justify-center rounded-lg">
              <AvatarCoverInput
                typeOfId={ContentIds.AVATAR_PROPERTY}
                entityId={id}
                inputId="avatar-input"
                imgUrl={avatarUrl}
              />
            </div>
          </div>
        )}
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
      className={`@container relative mx-auto w-full ${mobileCoverHeightClass} ${mobileCoverAvatarMarginClass}`}
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
            // Centred in a box the width of the *text column*, so its left edge
            // lands where the name below it starts. The cover is wider than the
            // column at every width (1192 against 900 or 1142), so aligning to
            // the cover instead puts the avatar 25–146px to the left of the
            // name — which is why this takes the column's width rather than
            // assuming one.
            //
            // And it has to take it *responsively*. `EntityPageContentContainer`
            // narrows a with-sidebar column back to 900px at `lg` (which is a
            // max-width of 1023px here), because the rail drops itself at that
            // point. A fixed 1142 left this box viewport-wide between 901px and
            // 1023px while the name centred at 900 — the avatar sliding up to
            // 121px left of the name it is supposed to line up with, in exactly
            // one band of widths.
            className={cx(
              'absolute right-0 left-0 mx-auto flex justify-start',
              contentInsetClassName,
              isWideColumn &&
                'max-w-[var(--entity-page-with-sidebar-max-width)] lg:max-w-[var(--entity-page-content-max-width)]'
            )}
            style={{
              bottom: -AVATAR_OVERFLOW,
              maxWidth: isWideColumn ? undefined : contentMaxWidth,
              // Declared here because the container's copy is scoped to its own
              // element, which is not an ancestor of this one.
              ...(isWideColumn ? ENTITY_PAGE_WIDTH_VARIABLES : {}),
            }}
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
