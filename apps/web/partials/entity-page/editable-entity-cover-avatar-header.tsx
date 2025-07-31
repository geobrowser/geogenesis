'use client';

import { ContentIds, SystemIds } from '@graphprotocol/grc-20';
import LegacyImage from 'next/legacy/image';

import { ChangeEvent, useRef } from 'react';
import { useState } from 'react';

import { useEditableProperties } from '~/core/hooks/use-renderables';
import { useUserIsEditing } from '~/core/hooks/use-user-is-editing';
import { Services } from '~/core/services';
import { useEntityStoreInstance } from '~/core/state/entity-page-store/entity-store-provider';
import { useMutate } from '~/core/sync/use-mutate';
import { useRelation } from '~/core/sync/use-store';
import { getImagePath } from '~/core/utils/utils';
import { Relation } from '~/core/v2.types';

import { SquareButton } from '~/design-system/button';
import { Dots } from '~/design-system/dots';
import { Trash } from '~/design-system/icons/trash';
import { Upload } from '~/design-system/icons/upload';

export const EditableCoverAvatarHeader = ({
  avatarUrl,
  coverUrl,
}: {
  avatarUrl: string | null;
  coverUrl: string | null;
}) => {
  const { spaceId, id } = useEntityStoreInstance();
  const editable = useUserIsEditing(spaceId);

  /**
   * We render the cover and avatar states depending on the editable state
   * and the entity's data.
   *
   * In edit mode we show the cover and avatar if it's already being rendered
   * as part of existing data or if it _should_ be rendered because it's in
   * the schema.
   *
   * In browse mode we show the cover and avatar if they exist in the relations
   * for the entity.
   */
  const coverRelation = useRelation({
    selector: r => r.type.id === SystemIds.COVER_PROPERTY && r.fromEntity.id === id && r.spaceId === spaceId,
  });

  const avatarRelation = useRelation({
    selector: r => r.type.id === ContentIds.AVATAR_PROPERTY && r.fromEntity.id === id && r.spaceId === spaceId,
  });

  const renderedProperties = useEditableProperties(id, spaceId);

  const coverRenderable = editable ? renderedProperties[SystemIds.COVER_PROPERTY] : coverRelation;
  const avatarRenderable = editable ? renderedProperties[ContentIds.AVATAR_PROPERTY] : avatarRelation;

  // Only show avatar when there's an actual avatar or user is in edit mode
  const showAvatar = avatarUrl || (editable && avatarRenderable);

  return (
    <div
      className={`${
        coverRenderable
          ? `relative ${showAvatar ? 'mb-20' : 'mb-8'} -mt-6 w-full max-w-[1192px] ${coverUrl ? 'h-80' : 'h-32'}`
          : `mx-auto ${showAvatar ? 'mb-16' : 'mb-0'} w-[880px] ${avatarUrl ? 'h-10' : ''}`
      }`}
    >
      {coverRenderable && (
        <div
          key={`cover-editable-avatar-header-${id}`}
          className="absolute left-1/2 top-0 flex h-full w-full max-w-[1192px] -translate-x-1/2 transform items-center justify-center rounded-lg bg-center bg-no-repeat transition-all duration-200 ease-in-out"
        >
          <AvatarCoverInput entityId={id} typeOfId={SystemIds.COVER_PROPERTY} inputId="cover-input" imgUrl={coverUrl} />
        </div>
      )}
      {/* Avatar placeholder - only show when there's an avatar or in edit mode with renderable */}
      {showAvatar && (
        <div
          className={`${
            coverRenderable
              ? 'absolute bottom-[-40px] left-0 right-0 mx-auto flex w-full max-w-[880px] justify-start'
              : 'mx-auto flex w-full max-w-[880px] justify-start'
          }`}
        >
          <div className="flex h-20 w-20 items-center justify-center rounded-lg transition-all duration-200 ease-in-out">
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
  const { ipfs } = Services.useServices();

  const isCover = typeOfId === SystemIds.COVER_PROPERTY;

  const editable = useUserIsEditing(spaceId);

  const firstRenderable = useRelation({
    selector: r => r.fromEntity.id === entityId && r.type.id === typeOfId && r.spaceId === spaceId,
  });

  const { storage } = useMutate();

  const onImageChange = (imageSrc: string) => {
    // const { id: imageId, ops } = Image.make({ cid: imageSrc });
    // const [createRelationOp, setTripleOp] = ops;
    // if (createRelationOp.type === 'CREATE_RELATION') {
    //   send({
    //     type: 'UPSERT_RELATION',
    //     payload: {
    //       fromEntityId: createRelationOp.relation.fromEntity,
    //       fromEntityName: name,
    //       toEntityId: createRelationOp.relation.toEntity,
    //       toEntityName: null,
    //       typeOfId: createRelationOp.relation.type,
    //       typeOfName: 'Types',
    //     },
    //   });
    // }
    // if (setTripleOp.type === 'SET_TRIPLE') {
    //   DB.upsert(
    //     {
    //       value: {
    //         type: 'URL',
    //         value: setTripleOp.triple.value.value,
    //       },
    //       entityId: imageId,
    //       attributeId: setTripleOp.triple.attribute,
    //       entityName: null,
    //       attributeName: 'Image URL',
    //     },
    //     spaceId
    //   );
    //   send({
    //     type: 'UPSERT_RELATION',
    //     payload: {
    //       fromEntityId: id,
    //       fromEntityName: name,
    //       toEntityId: imageId,
    //       toEntityName: null,
    //       typeOfId,
    //       typeOfName,
    //       renderableType: 'IMAGE',
    //       value: setTripleOp.triple.value.value,
    //     },
    //   });
    // }
  };

  const handleChange = async (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const file = e.target.files[0];
      setIsUploading(true);
      try {
        const imageSrc = await ipfs.uploadFile(file);
        // Only delete the old image after the new one is successfully uploaded
        if (imgUrl && firstRenderable) {
          deleteRelation(firstRenderable);
        }
        onImageChange(imageSrc);
      } catch (error) {
        console.error('Failed to upload image:', error);
      } finally {
        setIsUploading(false);
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
              : 'bg-cover-default bg-center bg-no-repeat hover:bg-cover-hover'
            : imgUrl
              ? 'relative h-[80px] w-[80px] overflow-hidden rounded-lg border border-white bg-transparent shadow-lg'
              : 'h-[80px] w-[80px] bg-avatar-default bg-center bg-no-repeat hover:bg-white hover:bg-avatar-hover'
        }`}
      >
        {imgUrl && (
          <LegacyImage
            layout="fill"
            src={getImagePath(imgUrl)}
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
