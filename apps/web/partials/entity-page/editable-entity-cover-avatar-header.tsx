'use client';

import { Image, SystemIds, ContentIds } from '@graphprotocol/grc-20';
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

const EditableCoverAvatarHeader = ({
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

  console.log('EditableCoverAvatarHeader triples', triples);
  console.log('EditableCoverAvatarHeader renderablesGroupedByAttributeId', renderablesGroupedByAttributeId);

  const coverRenderable = coverAvatarRenderable.find(r => r?.attributeId === SystemIds.COVER_PROPERTY);
  const avatarRenderable = coverAvatarRenderable.find(r => r?.attributeId === ContentIds.AVATAR_PROPERTY);
  
  // Only show avatar when there's an actual avatar or user is in edit mode
  const showAvatar = avatarUrl || (editable && avatarRenderable);

  return (
    <div className={`${coverRenderable 
      ? `relative ${showAvatar ? 'mb-20' : 'mb-8'} -mt-6 w-full max-w-[1192px] ${coverUrl ? 'h-80' : 'h-32'}` 
      : `mx-auto ${showAvatar ? 'mb-16' : 'mb-0'} w-[880px] ${avatarUrl ? 'h-10' : ''}`}`}
    >
      {coverRenderable && (
        <div
          key={`cover-${coverRenderable.attributeId}`}
          className="absolute left-1/2 top-0 flex h-full w-full max-w-[1192px] -translate-x-1/2 transform items-center justify-center rounded-lg bg-no-repeat bg-center transition-all duration-200 ease-in-out"
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
        <div className={`${coverRenderable 
          ? 'absolute bottom-[-40px] mx-auto w-full max-w-[880px] left-0 right-0 flex justify-start' 
          : 'w-full max-w-[880px] mx-auto flex justify-start'}`}>
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

export default EditableCoverAvatarHeader;

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

  const { spaceId, id, name } = useEntityPageStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { ipfs } = Services.useServices();

  const editable = useUserIsEditing(spaceId);
  const isCover = typeOfName === 'Cover';

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

    console.log('createRelationOp', createRelationOp);
    console.log('setTripleOp', setTripleOp);

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
    if (imgUrl) {
      deleteProperty();
    }
    if (e.target.files) {
      const file = e.target.files[0];
      const imageSrc = await ipfs.uploadFile(file);
      onImageChange(imageSrc);
      e.target.value = '';
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
        className={`relative h-full w-full rounded-lg ${typeOfName === 'Cover' 
          ? 'bg-cover-default hover:bg-cover-hover bg-no-repeat bg-center' 
          : imgUrl 
            ? 'bg-transparent relative h-[80px] w-[80px] overflow-hidden rounded-lg border border-white bg-grey-01 shadow-lg' 
            : 'bg-avatar-default bg-no-repeat bg-center hover:bg-avatar-hover h-[80px] w-[80px]'
        }`}
      >
        {imgUrl && (
          <LegacyImage
            layout="fill"
            src={getImagePath(imgUrl)}
            className="h-full w-full rounded-lg border border-white object-cover bg-transparent"
          />
        )}
        {editable && (
          <div className={`absolute flex items-center justify-center gap-[6px] ${
            isCover ? 'top-4 right-4' : 'left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 transform'
          }`}>
            {!imgUrl ? (
              <button onClick={openInput}>
                <Upload color={hovered ? 'text' : 'grey-03'} />
              </button>
            ) : (
              <>
                {hovered && (
                  <>
                    <SquareButton onClick={openInput} icon={<Upload color="grey-03" />} />

                    {imgUrl && <SquareButton onClick={deleteProperty} icon={<Trash color="grey-03" />} />}
                  </>
                )}
              </>
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
