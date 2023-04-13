import * as React from 'react';
import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import { SYSTEM_IDS } from '@geogenesis/ids';

import { useAccessControl } from '~/modules/auth/use-access-control';
import { EditableEntityPage } from '~/modules/components/entity/editable-entity-page';
import { ReadableEntityPage } from '~/modules/components/entity/readable-entity-page';
import { ReferencedByEntity } from '~/modules/components/entity/types';
import { Entity, EntityStoreProvider, useEntityStore } from '~/modules/entity';
import { Params } from '~/modules/params';
import { NetworkData } from '~/modules/io';
import { StorageClient } from '~/modules/services/storage';
import { useEditable } from '~/modules/stores/use-editable';
import { Space, Triple } from '~/modules/types';
import { NavUtils } from '~/modules/utils';
import { DEFAULT_PAGE_SIZE } from '~/modules/triple';
import { Value } from '~/modules/value';
import { TypesStoreProvider } from '~/modules/type/types-store';
import { Truncate } from '~/modules/design-system/truncate';
import { Text } from '~/modules/design-system/text';
import { Spacer } from '~/modules/design-system/spacer';
import { EntityPageMetadataHeader } from '~/modules/components/entity-page/entity-page-metadata-header';
import { Editor } from '~/modules/components/editor/editor';
import { EntityPageCover } from '~/modules/components/entity/entity-page-cover';
import { EntityPageContentContainer } from '~/modules/components/entity/entity-page-content-container';
import { PageStringField } from '~/modules/components/entity/editable-fields';
import { useActionsStore } from '~/modules/action';
import { useEditEvents } from '~/modules/components/entity/edit-events';

interface Props {
  triples: Triple[];
  id: string;
  name: string;
  description: string | null;
  spaceId: string;
  referencedByEntities: ReferencedByEntity[];
  serverAvatarUrl: string | null;
  serverCoverUrl: string | null;

  // For the page editor
  blockTriples: Triple[];
  blockIdsTriple: Triple | null;

  spaceTypes: Triple[];
  space: Space | null;
}

export default function EntityPage(props: Props) {
  const { isEditor } = useAccessControl(props.spaceId);
  const { editable } = useEditable();

  const renderEditablePage = isEditor && editable;
  const Page = renderEditablePage ? EditableEntityPage : ReadableEntityPage;

  const avatarUrl = Entity.avatar(props.triples) ?? props.serverAvatarUrl;
  const coverUrl = Entity.cover(props.triples) ?? props.serverCoverUrl;

  return (
    <>
      <Head>
        <title>{props.name ?? props.id}</title>
        <meta property="og:title" content={props.name} />
        <meta property="og:url" content={`https://geobrowser.io${NavUtils.toEntity(props.spaceId, props.id)}`} />
        {props.serverCoverUrl && <meta property="og:image" content={props.serverCoverUrl} />}
        {props.serverCoverUrl && (
          <meta name="twitter:image" content="https://www.geobrowser.io/static/geo-social-image.png" />
        )}
        {props.description && <meta property="description" content={props.description} />}
        {props.description && <meta property="og:description" content={props.description} />}
        {props.description && <meta name="twitter:description" content={props.description} />}
      </Head>

      <TypesStoreProvider initialTypes={props.spaceTypes} space={props.space}>
        <EntityStoreProvider
          id={props.id}
          spaceId={props.spaceId}
          initialTriples={props.triples}
          initialSchemaTriples={[]}
          initialBlockIdsTriple={props.blockIdsTriple}
          initialBlockTriples={props.blockTriples}
        >
          <EntityPageCover avatarUrl={avatarUrl} coverUrl={coverUrl} />

          <EntityPageContentContainer>
            <EditableHeading spaceId={props.spaceId} entityId={props.id} name={props.name} triples={props.triples} />
            <Page {...props} />
          </EntityPageContentContainer>
        </EntityStoreProvider>
      </TypesStoreProvider>
    </>
  );
}

function EditableHeading({
  spaceId,
  entityId,
  name: serverName,
  triples: serverTriples,
}: {
  spaceId: string;
  entityId: string;
  name: string;
  triples: Triple[];
}) {
  const { triples: localTriples, update, create, remove } = useEntityStore();
  const { editable } = useEditable();
  const { isEditor } = useAccessControl(spaceId);
  const { actionsFromSpace } = useActionsStore(spaceId);

  const triples = localTriples.length === 0 && actionsFromSpace.length === 0 ? serverTriples : localTriples;

  const nameTriple = Entity.nameTriple(triples);
  const name = Entity.name(triples) ?? serverName;
  const types = Entity.types(triples) ?? [];

  const isEditing = editable && isEditor;

  const send = useEditEvents({
    context: {
      entityId,
      spaceId,
      entityName: name,
    },
    api: {
      create,
      update,
      remove,
    },
  });

  const onNameChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    send({
      type: 'EDIT_ENTITY_NAME',
      payload: {
        name: e.target.value,
        triple: nameTriple,
      },
    });
  };

  return (
    <div>
      {isEditing ? (
        <div>
          <PageStringField variant="mainPage" placeholder="Entity name..." value={name} onChange={onNameChange} />
          {/* 
            This height differs from the readable page height due to how we're using an expandable textarea for editing
            the entity name. We can't perfectly match the height of the normal <Text /> field with the textarea, so we
            have to manually adjust the spacing here to remove the layout shift.
          */}
          <Spacer height={5.5} />
        </div>
      ) : (
        <div>
          <Truncate maxLines={3} shouldTruncate>
            <Text as="h1" variant="mainPage">
              {name}
            </Text>
          </Truncate>
          <Spacer height={12} />
        </div>
      )}

      <EntityPageMetadataHeader id={entityId} spaceId={spaceId} types={types} />
      <Spacer height={40} />
      <Editor editable={isEditing} />
    </div>
  );
}

export const getServerSideProps: GetServerSideProps<Props> = async context => {
  const spaceId = context.query.id as string;
  const entityId = context.query.entityId as string;
  const config = Params.getConfigFromUrl(context.resolvedUrl, context.req.cookies[Params.ENV_PARAM_NAME]);

  const storage = new StorageClient(config.ipfs);
  const network = new NetworkData.Network(storage, config.subgraph);

  const [entity, related, spaceTypes] = await Promise.all([
    network.fetchEntity(entityId),

    network.fetchEntities({
      query: '',
      filter: [{ field: 'linked-to', value: entityId }],
    }),

    fetchSpaceTypeTriples(network, spaceId),
  ]);
  const serverAvatarUrl = Entity.avatar(entity?.triples);
  const serverCoverUrl = Entity.cover(entity?.triples);

  const spaces = await network.fetchSpaces();

  const referencedByEntities: ReferencedByEntity[] = related.map(e => {
    const spaceId = Entity.nameTriple(e.triples)?.space ?? '';
    const space = spaces.find(s => s.id === spaceId);
    const spaceName = space?.attributes[SYSTEM_IDS.NAME] ?? null;
    const spaceImage = space?.attributes[SYSTEM_IDS.IMAGE_ATTRIBUTE] ?? null;

    return {
      id: e.id,
      name: e.name,
      types: e.types,
      space: {
        id: spaceId,
        name: spaceName,
        image: spaceImage,
      },
    };
  });

  /* Storing the array of block ids as a string value since we currently do not support arrays */
  // @TODO: the Block triple for the entity should already be fetched in the entity query above
  const blockIdTriples = await network.fetchTriples({
    space: spaceId,
    query: '',
    skip: 0,
    first: DEFAULT_PAGE_SIZE,
    filter: [
      { field: 'entity-id', value: entityId },
      {
        field: 'attribute-id',
        value: SYSTEM_IDS.BLOCKS,
      },
    ],
  });

  const blockIdsTriple = blockIdTriples.triples[0] || null;

  const blockIds: string[] = blockIdsTriple ? JSON.parse(Value.stringValue(blockIdsTriple) || '[]') : [];

  // @TODO: Try and use fetchEntity instead
  const blockTriples = (
    await Promise.all(
      blockIds.map(blockId => {
        return network.fetchTriples({
          space: spaceId,
          query: '',
          skip: 0,
          first: DEFAULT_PAGE_SIZE,
          filter: [{ field: 'entity-id', value: blockId }],
        });
      })
    )
  ).flatMap(block => block.triples);

  return {
    props: {
      triples: entity?.triples ?? [],
      id: entityId,
      name: entity?.name ?? entityId,
      description: Entity.description(entity?.triples ?? []),
      spaceId,
      referencedByEntities,
      key: entityId,
      serverAvatarUrl,
      serverCoverUrl,

      space: spaces.find(s => s.id === spaceId) ?? null,

      // For entity page editor
      blockIdsTriple,
      blockTriples,

      spaceTypes,
    },
  };
};

export const fetchSpaceTypeTriples = async (network: NetworkData.INetwork, spaceId: string) => {
  /* Fetch all entities with a type of type (e.g. Person / Place / Claim) */

  const { triples } = await network.fetchTriples({
    query: '',
    space: spaceId,
    skip: 0,
    first: DEFAULT_PAGE_SIZE,
    filter: [
      { field: 'attribute-id', value: SYSTEM_IDS.TYPES },
      {
        field: 'linked-to',
        value: SYSTEM_IDS.SCHEMA_TYPE,
      },
    ],
  });

  return triples;
};
