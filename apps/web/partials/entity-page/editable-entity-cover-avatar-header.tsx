'use client';

import { ContentIds, SystemIds } from '@geoprotocol/geo-sdk';
import { AnimatePresence, motion } from 'framer-motion';

import { ChangeEvent, useRef, useState } from 'react';

import { useEditableProperties } from '~/core/hooks/use-renderables';
import { useUserIsEditing } from '~/core/hooks/use-user-is-editing';
import { useEntityStoreInstance } from '~/core/state/entity-page-store/entity-store-provider';
import { useMutate } from '~/core/sync/use-mutate';
import { useRelation } from '~/core/sync/use-store';
import { Relation } from '~/core/types';

import { SquareButton } from '~/design-system/button';
import { Dots } from '~/design-system/dots';
import { GeoImage } from '~/design-system/geo-image';
import { Trash } from '~/design-system/icons/trash';
import { Upload } from '~/design-system/icons/upload';

// Layout constants — the state table from the plan.
//
// | State                          | height | maxWidth | marginBottom | marginTop |
// | ------------------------------ | ------ | -------- | ------------ | --------- |
// | No cover, no avatar            | 0      | 880      | 0            | 0         |
// | No cover, with avatar          | 40     | 880      | 64           | 0         |
// | Cover placeholder, no avatar   | 120    | 1192     | 32           | -24       |
// | Cover placeholder, with avatar | 120    | 1192     | 80           | -24       |
// | Cover image, no avatar         | 320    | 1192     | 32           | -24       |
// | Cover image, with avatar       | 320    | 1192     | 80           | -24       |
const COVER_IMAGE_HEIGHT = 320;
const COVER_PLACEHOLDER_HEIGHT = 120; // Matches the Cover_Default.svg dimensions
const AVATAR_ONLY_HEIGHT = 40;
const COVER_MAX_WIDTH = 1192;
const CONTENT_MAX_WIDTH = 880;
const AVATAR_OVERFLOW = 40; // How far the avatar hangs below the wrapper
const COVER_MARGIN_TOP = -24;
const TRANSITION = { duration: 0.2, ease: 'easeInOut' as const };

function computeLayout(hasCover: boolean, hasCoverImage: boolean, hasAvatar: boolean) {
  return {
    height: hasCover ? (hasCoverImage ? COVER_IMAGE_HEIGHT : COVER_PLACEHOLDER_HEIGHT) : hasAvatar ? AVATAR_ONLY_HEIGHT : 0,
    maxWidth: hasCover ? COVER_MAX_WIDTH : CONTENT_MAX_WIDTH,
    marginBottom: hasCover ? (hasAvatar ? 80 : 32) : hasAvatar ? 64 : 0,
    marginTop: hasCover ? COVER_MARGIN_TOP : 0,
  };
}

export const EditableCoverAvatarHeader = ({
  avatarUrl,
  coverUrl,
}: {
  avatarUrl: string | null;
  coverUrl: string | null;
}) => {
  const { spaceId, id } = useEntityStoreInstance();
  const editable = useUserIsEditing(spaceId);

  const renderedProperties = useEditableProperties(id, spaceId);

  // In browse mode, derive visibility from the props (which are stable from the
  // server and update reactively via entity-page-cover.tsx's store subscriptions).
  // In edit mode, use the schema-based renderables so cover/avatar placeholders
  // appear even before the user has uploaded an image.
  const coverRenderable = editable ? renderedProperties[SystemIds.COVER_PROPERTY] || coverUrl : coverUrl;
  const showAvatar = editable ? avatarUrl || renderedProperties[ContentIds.AVATAR_PROPERTY] : avatarUrl;

  const layout = computeLayout(!!coverRenderable, !!coverUrl, !!showAvatar);

  return (
    <motion.div
      initial={false}
      animate={layout}
      transition={TRANSITION}
      className="relative mx-auto w-full"
    >
      {/* Cover — opacity fade */}
      <AnimatePresence initial={false}>
        {coverRenderable && (
          <motion.div
            key="cover"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={TRANSITION}
            className="absolute inset-0 flex items-center justify-center rounded-lg bg-center bg-no-repeat"
          >
            <AvatarCoverInput entityId={id} typeOfId={SystemIds.COVER_PROPERTY} inputId="cover-input" imgUrl={coverUrl} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Avatar — always absolute, position driven by wrapper height */}
      <AnimatePresence initial={false}>
        {showAvatar && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={TRANSITION}
            className="absolute left-0 right-0 mx-auto flex max-w-[880px] justify-start"
            style={{ bottom: -AVATAR_OVERFLOW }}
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
}: {
  typeOfId: string;
  inputId: string;
  entityId: string;
  imgUrl?: string | null;
}) => {
  const [hovered, setHovered] = useState(false);
  const [hoveredIcon, setHoveredIcon] = useState('');
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
        className={`relative h-full w-full rounded-lg ${!imgUrl && editable ? 'cursor-pointer' : ''} ${
          isCover
            ? imgUrl
              ? 'bg-transparent'
              : 'bg-cover-default bg-contain bg-center bg-no-repeat hover:bg-cover-hover'
            : imgUrl
              ? 'relative h-[80px] w-[80px] overflow-hidden rounded-lg border border-white bg-transparent shadow-lg'
              : 'h-[80px] w-[80px] bg-avatar-default bg-center bg-no-repeat hover:bg-white hover:bg-avatar-hover'
        }`}
      >
        {imgUrl && (
          <GeoImage
            fill
            value={imgUrl}
            unoptimized={true}
            alt=""
            className="h-full w-full rounded-lg border border-white bg-white object-cover"
          />
        )}
        {editable && (
          <div
            className={`absolute ${imgUrl && isCover ? 'right-4 top-4 justify-end' : 'left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2'} flex transform items-center gap-[6px]`}
          >
            {isUploading ? (
              <SquareButton disabled className="pointer-events-none border-none bg-white/85">
                <Dots color="bg-grey-03" />
              </SquareButton>
            ) : !imgUrl ? (
              <Upload color={hovered ? undefined : 'grey-03'} />
            ) : (
              hovered && (
                <>
                  <SquareButton
                    onMouseEnter={() => setHoveredIcon('Upload')}
                    onMouseLeave={() => setHoveredIcon('')}
                    onClick={openInput}
                    icon={<Upload />}
                  />

                  <SquareButton
                    onMouseEnter={() => setHoveredIcon('Trash')}
                    onMouseLeave={() => setHoveredIcon('')}
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
