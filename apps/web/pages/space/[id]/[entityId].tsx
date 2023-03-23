import type { GetServerSideProps } from 'next';
import { useEffect } from 'react';
import Head from 'next/head';

import { useLogRocket } from '~/modules/analytics/use-logrocket';
import { useAccessControl } from '~/modules/auth/use-access-control';
import { EditableEntityPage } from '~/modules/components/entity/editable-entity-page';
import { ReadableEntityPage } from '~/modules/components/entity/readable-entity-page';
import { ReferencedByEntity } from '~/modules/components/entity/types';
import { Entity, EntityStoreProvider } from '~/modules/entity';
import { Params } from '~/modules/params';
import { Network } from '~/modules/services/network';
import { StorageClient } from '~/modules/services/storage';
import { useEditable } from '~/modules/stores/use-editable';
import { usePageName } from '~/modules/stores/use-page-name';
import { Triple, Version } from '~/modules/types';
import { EntityPageContentContainer } from '~/modules/components/entity/entity-page-content-container';
import { NavUtils } from '~/modules/utils';
import { SYSTEM_IDS } from '~/../../packages/ids';

interface Props {
  triples: Triple[];
  schemaTriples: Triple[];
  versions: Version[];
  id: string;
  name: string;
  space: string;
  referencedByEntities: ReferencedByEntity[];
}

export default function EntityPage(props: Props) {
  const { setPageName } = usePageName();
  const { isEditor } = useAccessControl(props.space);
  const { editable } = useEditable();
  useLogRocket(props.space);

  // This is a janky way to set the name in the navbar until we have nested layouts
  // and the navbar can query the name itself in a nice way.
  useEffect(() => {
    if (props.name !== props.id) setPageName(props.name);
    return () => setPageName('');
  }, [props.name, props.id, setPageName]);

  const renderEditablePage = isEditor && editable;
  const Page = renderEditablePage ? EditableEntityPage : ReadableEntityPage;

  return (
    <>
      <Head>
        <title>{props.name ?? props.id}</title>
        <meta property="og:url" content={`https://geobrowser.io${NavUtils.toEntity(props.space, props.id)}`} />
      </Head>
      <EntityStoreProvider
        id={props.id}
        spaceId={props.space}
        initialTriples={props.triples}
        initialSchemaTriples={props.schemaTriples}
        initialBlockIdsTriple={null}
        initialBlockTriples={[]}
      >
        <EntityPageContentContainer>
          <Page {...props} />
        </EntityPageContentContainer>
      </EntityStoreProvider>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<Props> = async context => {
  const space = context.query.id as string;
  const entityId = context.query.entityId as string;
  const config = Params.getConfigFromUrl(context.resolvedUrl, context.req.cookies[Params.ENV_PARAM_NAME]);

  const storage = new StorageClient(config.ipfs);
  const network = new Network(storage, config.subgraph);

  const [entity, related, versions] = await Promise.all([
    network.fetchEntity(entityId),

    network.fetchEntities({
      query: '',
      filter: [{ field: 'linked-to', value: entityId }],
    }),

    network.fetchProposedVersions(entityId, space),
  ]);

  // @TODO: throw 404
  if (!entity)
    return {
      props: {
        triples: [],
        schemaTriples: [],
        id: entityId,
        name: entityId,
        space,
        referencedByEntities: [],
        versions,
        key: entityId,
      },
    };

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

  return {
    props: {
      triples: entity.triples,
      schemaTriples: [] /* @TODO: Fetch schema triples for entity if entity has a type */,
      id: entityId,
      name: entity.name ?? entityId,
      space,
      referencedByEntities,
      versions,
      key: entityId,
    },
  };
};
