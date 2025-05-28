'use client';

import { ContentIds, Image, SystemIds } from '@graphprotocol/grc-20';
import LegacyImage from 'next/legacy/image';

import { ChangeEvent, useRef } from 'react';
import { useState } from 'react';

import { DB } from '~/core/database/write';
import { useEditEvents } from '~/core/events/edit-events';
import { useRelationship } from '~/core/hooks/use-relationship';
import { useRenderables } from '~/core/hooks/use-renderables';
import { useUserIsEditing } from '~/core/hooks/use-user-is-editing';
import { Services } from '~/core/services';
import { useEntityPageStore } from '~/core/state/entity-page-store/entity-store';
import { Triple } from '~/core/types';
import { RenderableProperty } from '~/core/types';
import { getImagePath } from '~/core/utils/utils';

import { SquareButton } from '~/design-system/button';
import { Trash } from '~/design-system/icons/trash';
import { Upload } from '~/design-system/icons/upload';
import { Dots } from '~/design-system/dots';

export const EditableCoverAvatarHeader = ({
  avatarUrl,
  triples,
  coverUrl,
}: {
  avatarUrl: string | null;
  triples: Triple[] | undefined;
  coverUrl: string | null;
}) => {
  const { spaceId, id } = useEntityPageStore();
  const entityId = id;
  const [isRelationPage] = useRelationship(entityId, spaceId);
  const editable = useUserIsEditing(spaceId);
  const { renderablesGroupedByAttributeId } = useRenderables(triples ?? [], spaceId, isRelationPage);

  const coverAvatarRenderable = Object.entries(renderablesGroupedByAttributeId).map(([attributeId, renderables]) => {
    const firstRenderable = renderables[0];
    const renderableType = firstRenderable.type;

    if (
      (renderableType === 'IMAGE' && firstRenderable.attributeId === SystemIds.COVER_PROPERTY) ||
      (renderableType === 'IMAGE' && firstRenderable.attributeId === ContentIds.AVATAR_PROPERTY)
    ) {
      return firstRenderable;
    }
  });

  const coverRenderable = coverAvatarRenderable.find(r => r?.attributeId === SystemIds.COVER_PROPERTY);
  const avatarRenderable = coverAvatarRenderable.find(r => r?.attributeId === ContentIds.AVATAR_PROPERTY);

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
          key={`cover-${coverRenderable.attributeId}`}
          className="absolute left-1/2 top-0 flex h-full w-full max-w-[1192px] -translate-x-1/2 transform items-center justify-center rounded-lg bg-center bg-no-repeat transition-all duration-200 ease-in-out"
        >
          <AvatarCoverInput
            typeOfId={coverRenderable.attributeId}
            typeOfName={coverRenderable.attributeName ?? ''}
            inputId="cover-input"
            firstRenderable={coverRenderable}
            imgUrl={coverUrl}
          />
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
              typeOfName={'Avatar'}
              inputId="avatar-input"
              firstRenderable={avatarRenderable ?? null}
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
  typeOfName,
  inputId,
  firstRenderable,
  imgUrl,
}: {
  typeOfId: string;
  typeOfName: string;
  inputId: string;
  firstRenderable: RenderableProperty | null;
  imgUrl?: string | null;
}) => {
  const [hovered, setHovered] = useState(false);
  const [hoveredIcon, setHoveredIcon] = useState('');
  const [isUploading, setIsUploading] = useState(false);

  const { spaceId, id, name } = useEntityPageStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { ipfs } = Services.useServices();

  const isCover = typeOfId === SystemIds.COVER_PROPERTY;

  const editable = useUserIsEditing(spaceId);

  const send = useEditEvents({
    context: {
      entityId: id,
      spaceId,
      entityName: name ?? '',
    },
  });

  const onImageChange = (imageSrc: string) => {
    const { id: imageId, ops } = Image.make({ cid: imageSrc });
    const [createRelationOp, setTripleOp] = ops;

    if (createRelationOp.type === 'CREATE_RELATION') {
      send({
        type: 'UPSERT_RELATION',
        payload: {
          fromEntityId: createRelationOp.relation.fromEntity,
          fromEntityName: name,
          toEntityId: createRelationOp.relation.toEntity,
          toEntityName: null,
          typeOfId: createRelationOp.relation.type,
          typeOfName: 'Types',
        },
      });
    }

    if (setTripleOp.type === 'SET_TRIPLE') {
      DB.upsert(
        {
          value: {
            type: 'URL',
            value: setTripleOp.triple.value.value,
          },
          entityId: imageId,
          attributeId: setTripleOp.triple.attribute,
          entityName: null,
          attributeName: 'Image URL',
        },
        spaceId
      );

      send({
        type: 'UPSERT_RELATION',
        payload: {
          fromEntityId: id,
          fromEntityName: name,
          toEntityId: imageId,
          toEntityName: null,
          typeOfId,
          typeOfName,
          renderableType: 'IMAGE',
          value: setTripleOp.triple.value.value,
        },
      });
    }
  };

  const handleChange = async (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const file = e.target.files[0];
      setIsUploading(true);
      try {
        const imageSrc = await ipfs.uploadFile(file);
        // Only delete the old image after the new one is successfully uploaded
        if (imgUrl && firstRenderable) {
          deleteProperty();
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

  const deleteProperty = () => {
    if (firstRenderable) send({ type: 'DELETE_RENDERABLE', payload: { renderable: firstRenderable } });
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
              : 'h-[80px] w-[80px] bg-avatar-default bg-center bg-no-repeat hover:bg-avatar-hover hover:bg-white'
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
              <SquareButton disabled className="pointer-events-none bg-white/85 border-none">
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
                    onClick={deleteProperty}
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
