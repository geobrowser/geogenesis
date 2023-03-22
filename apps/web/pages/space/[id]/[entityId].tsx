import type { GetServerSideProps } from 'next';
import { useEffect } from 'react';
import Head from 'next/head';

import { useLogRocket } from '~/modules/analytics/use-logrocket';
import { useAccessControl } from '~/modules/auth/use-access-control';
import { EditableEntityPage } from '~/modules/components/entity/editable-entity-page';
import { ReadableEntityPage } from '~/modules/components/entity/readable-entity-page';
import { LinkedEntityGroup } from '~/modules/components/entity/types';
import { Entity, EntityStoreProvider } from '~/modules/entity';
import { Params } from '~/modules/params';
import { Network } from '~/modules/services/network';
import { StorageClient } from '~/modules/services/storage';
import { useEditable } from '~/modules/stores/use-editable';
import { usePageName } from '~/modules/stores/use-page-name';
import { DEFAULT_PAGE_SIZE } from '~/modules/triple';
import { Triple, Version } from '~/modules/types';
import { EntityPageContentContainer } from '~/modules/components/entity/entity-page-content-container';
import { NavUtils } from '~/modules/utils';

interface Props {
  triples: Triple[];
  schemaTriples: Triple[];
  versions: Version[];
  id: string;
  name: string;
  space: string;
  linkedEntities: Record<string, LinkedEntityGroup>;
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
    network.fetchTriples({
      space,
      query: '',
      skip: 0,
      first: DEFAULT_PAGE_SIZE,
      filter: [{ field: 'entity-id', value: entityId }],
    }),

    network.fetchTriples({
      space,
      query: '',
      skip: 0,
      first: DEFAULT_PAGE_SIZE,
      filter: [{ field: 'linked-to', value: entityId }],
    }),

    network.fetchProposedVersions(entityId, space),
  ]);

  const relatedEntities = await Promise.all(
    related.triples.map(triple =>
      network.fetchTriples({
        space,
        query: '',
        skip: 0,
        first: DEFAULT_PAGE_SIZE,
        filter: [{ field: 'entity-id', value: triple.entityId }],
      })
    )
  );

  const linkedEntities: Record<string, LinkedEntityGroup> = relatedEntities
    .flatMap(entity => entity.triples)
    .reduce((acc, triple) => {
      if (!acc[triple.entityId]) acc[triple.entityId] = { triples: [], name: null, id: triple.entityId };
      acc[triple.entityId].id = triple.entityId;
      acc[triple.entityId].name = triple.entityName;
      acc[triple.entityId].triples = [...acc[triple.entityId].triples, triple]; // Duplicates?
      return acc;
    }, {} as Record<string, LinkedEntityGroup>);

  return {
    props: {
      triples: entity.triples,
      schemaTriples: [] /* Todo: Fetch schema triples for entity if entity has a type */,
      id: entityId,
      name: Entity.name(entity.triples) ?? entityId,
      space,
      linkedEntities,
      versions,
      key: entityId,
    },
  };
};
