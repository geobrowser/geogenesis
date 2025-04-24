'use client';

import { Image } from '@graphprotocol/grc-20';
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

  //Avatar values
  const typeOfId = '399xP4sGWSoepxeEnp3UdR';
  const typeOfName = 'Avatar';

  const coverAvatarRenderable = Object.entries(renderablesGroupedByAttributeId).map(([attributeId, renderables]) => {
    const firstRenderable = renderables[0];
    const renderableType = firstRenderable.type;

    if (
      (renderableType === 'IMAGE' && firstRenderable.attributeId === '7YHk6qYkNDaAtNb8GwmysF') ||
      (renderableType === 'IMAGE' && firstRenderable.attributeId === '399xP4sGWSoepxeEnp3UdR')
    ) {
      return firstRenderable;
    }
  });

  const coverRenderable = coverAvatarRenderable.find(r => r?.attributeId === '7YHk6qYkNDaAtNb8GwmysF');
  const avatarRenderable = coverAvatarRenderable.find(r => r?.attributeId === '399xP4sGWSoepxeEnp3UdR');

  return (
    <div className={`relative mb-20 min-h-[7.5rem] w-full max-w-[1192px] ${coverUrl ? 'h-[320px]' : ''}`}>
      {coverRenderable && (
        <div
          key={`cover-${coverRenderable.attributeId}`}
          className="absolute left-1/2 top-0 flex h-full w-full max-w-[1192px] -translate-x-1/2 transform items-center justify-center rounded-lg bg-cover-default bg-cover transition-all duration-200 ease-in-out hover:bg-cover-hover "
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
      {/* Avatar placeholder */}
      {editable || avatarUrl ? (
        <div className="absolute -bottom-10 left-[157px] flex h-20 w-20 items-center justify-center rounded-lg ">
          <div className="flex h-full w-full items-center justify-center rounded-lg transition-all duration-200 ease-in-out">
            <AvatarCoverInput
              typeOfId={typeOfId}
              typeOfName={typeOfName}
              inputId="avatar-input"
              firstRenderable={avatarRenderable ?? null}
              imgUrl={avatarUrl}
            />
          </div>
        </div>
      ) : null}
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
    if (imgUrl) {
      deleteProperty();
    }
    if (e.target.files) {
      const file = e.target.files[0];
      const imageSrc = await ipfs.uploadFile(file);
      onImageChange(imageSrc);
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
        className={`relative h-full w-full rounded-lg ${typeOfName === 'Cover' ? 'bg-cover-default hover:bg-cover-hover' : imgUrl ? '' : 'bg-avatar-default bg-cover hover:bg-avatar-hover'}`}
      >
        {imgUrl && (
          <LegacyImage
            layout="fill"
            src={getImagePath(imgUrl)}
            className="h-full w-full rounded-lg border border-white object-cover shadow-dropdown "
          />
        )}
        {editable && (
          <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 transform items-center justify-center gap-[6px]">
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
