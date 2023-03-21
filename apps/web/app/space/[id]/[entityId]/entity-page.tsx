'use client';

import * as React from 'react';

import { useAccessControl } from '~/modules/auth/use-access-control';
import { EditableEntityPage } from '~/modules/components/entity/editable-entity-page';
import { ReadableEntityPage } from '~/modules/components/entity/readable-entity-page';
import { LinkedEntityGroup } from '~/modules/components/entity/types';
import { EntityStoreProvider } from '~/modules/entity';
import { useEditable } from '~/modules/stores/use-editable';
import { Triple } from '~/modules/types';
import { usePageName } from '~/modules/stores/use-page-name';

interface Props {
  triples: Triple[];
  schemaTriples: Triple[];
  id: string;
  name: string;
  spaceId: string;
  linkedEntities: Record<string, LinkedEntityGroup>;
}

export function EntityPageClient({ id, name, schemaTriples, linkedEntities, triples, spaceId }: Props) {
  const { setPageName } = usePageName();
  const { isEditor } = useAccessControl(id);
  const { editable } = useEditable();

  // This is a janky way to set the name in the navbar until we have nested layouts
  // and the navbar can query the name itself in a nice way.
  React.useEffect(() => {
    if (name !== id) setPageName(name);
    return () => setPageName('');
  }, [name, id, setPageName]);

  const renderEditablePage = isEditor && editable;
  // const renderEditablePage = true;
  const Page = renderEditablePage ? EditableEntityPage : ReadableEntityPage;
  console.log('renderEditablePage', { isEditor, editable });

  return (
    <EntityStoreProvider id={id} spaceId={spaceId} initialTriples={triples} initialSchemaTriples={schemaTriples}>
      <Page
        linkedEntities={linkedEntities}
        id={id}
        name={name}
        schemaTriples={schemaTriples}
        space={spaceId}
        triples={triples}
      />
    </EntityStoreProvider>
  );
}
