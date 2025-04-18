'use client';

import { Image } from '@graphprotocol/grc-20';

import { ChangeEvent, useRef } from 'react';

import { DB } from '~/core/database/write';
import { useEditEvents } from '~/core/events/edit-events';
import { useRelationship } from '~/core/hooks/use-relationship';
import { useRenderables } from '~/core/hooks/use-renderables';
import { Services } from '~/core/services';
import { useEntityPageStore } from '~/core/state/entity-page-store/entity-store';
import { Triple } from '~/core/types';

import { Upload } from '~/design-system/icons/upload';

const EditableCoverAvatarHeader = ({
  avatarUrl,
  triples,
}: {
  avatarUrl: string | null;
  triples: Triple[] | undefined;
}) => {
  const { spaceId, id } = useEntityPageStore();

  const entityId = id;

  const [isRelationPage] = useRelationship(entityId, spaceId);

  const { renderablesGroupedByAttributeId } = useRenderables(triples ?? [], spaceId, isRelationPage);

  console.log(renderablesGroupedByAttributeId);

  return (
    <div className="relative mb-10 min-h-[7.5rem] w-full max-w-[1192px]">
      {Object.entries(renderablesGroupedByAttributeId).map(([attributeId, renderables]) => {
        const firstRenderable = renderables[0];
        const renderableType = firstRenderable.type;

        if (renderableType === 'IMAGE' && firstRenderable.attributeId === '7YHk6qYkNDaAtNb8GwmysF') {
          return (
            <div className="absolute left-1/2 top-0 flex h-full w-full max-w-[1192px] -translate-x-1/2 transform items-center justify-center rounded-lg bg-cover-default bg-cover ">
              <CoverImageInput
                attributeId={firstRenderable.attributeId}
                attributeName={firstRenderable.attributeName}
              />
            </div>
          );
        } else if (renderableType === 'IMAGE' && firstRenderable.attributeId === '399xP4sGWSoepxeEnp3UdR') {
          // Avatar placeholder should be here
          // When we change type in avatar property to "IMAGE", we do not receive it here in renderablesGroupedByAttributeId
          // But in EditableEntityPage we receive it. We use the same hooks but get diff values.
          // So for now I cannot indicate avatar property to render it on top cover
          return <div className="absolute top-52 text-red-01">Avatar here</div>;
        }
      })}
    </div>
  );
};

export default EditableCoverAvatarHeader;

const CoverImageInput = ({ attributeId, attributeName }: { attributeId: string; attributeName: string | null }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { ipfs } = Services.useServices();

  const { id, name, spaceId } = useEntityPageStore();

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
          typeOfId: attributeId,
          typeOfName: attributeName,
          renderableType: 'IMAGE',
          value: setTripleOp.triple.value.value,
        },
      });
    }
  };

  const handleChange = async (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const file = e.target.files[0];
      const imageSrc = await ipfs.uploadFile(file);
      onImageChange(imageSrc);
    }
  };

  return (
    <>
      <div className="flex justify-center gap-2 pt-2">
        <label htmlFor="avatar-file" className="cursor-pointer">
          <Upload color="grey-03" />
        </label>
      </div>

      <input
        ref={fileInputRef}
        accept="image/png, image/jpeg"
        id="avatar-file"
        onChange={handleChange}
        type="file"
        className="hidden"
      />
    </>
  );
};
