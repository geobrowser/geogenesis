import * as React from 'react';
import { useEffect } from 'react';
import type { GetServerSideProps } from 'next';

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
  // const renderEditablePage = true;
  const Page = renderEditablePage ? EditableEntityPage : ReadableEntityPage;

  return (
    <EntityStoreProvider
      id={props.id}
      spaceId={props.space}
      initialTriples={props.triples}
      initialSchemaTriples={props.schemaTriples}
    >
      <Page {...props} />
    </EntityStoreProvider>
  );
}

// const mockVersions = [
//   {
//     id: 'alksjdalkj',
//     name: 'Amended the title',
//     createdBy: {
//       id: '0x66703c058795B9Cb215fbcc7c6b07aee7D216F24',
//       name: 'Yaniv Tal',
//     },
//     createdAt: Date.now(),
//     actions: [
//       {
//         type: 'createTriple' as const,
//         ...makeStubTriple('Alice'),
//       },
//     ],
//   },
//   {
//     id: 'a0s7dakjhds',
//     name: 'Created a page for ending homelessness',
//     createdBy: {
//       id: '0x66703c058795B9Cb215fbcc7c6b07aee7D216F30',
//       name: 'Nate Walpole',
//     },
//     createdAt: Date.now() - 2348395873,
//     actions: [
//       {
//         type: 'createTriple' as const,
//         ...makeStubTriple('Alice'),
//       },
//     ],
//   },
// ];

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
