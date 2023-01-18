import { GetServerSideProps } from 'next';
import { useLogRocket } from '~/modules/analytics/use-logrocket';
import { useAccessControl } from '~/modules/auth/use-access-control';
import { EditableEntityPage } from '~/modules/components/entity/editable-entity-page';
import { ReadableEntityPage } from '~/modules/components/entity/readable-entity-page';
import { EntityStoreProvider } from '~/modules/entity';
import { useEditable } from '~/modules/stores/use-editable';

interface Props {
  id: string;
  space: string;
}

export default function EntityPage(props: Props) {
  const { isEditor } = useAccessControl(props.space);
  const { editable } = useEditable();
  useLogRocket(props.space);

  const renderEditablePage = isEditor && editable;
  // const renderEditablePage = true;
  const Page = renderEditablePage ? EditableEntityPage : ReadableEntityPage;

  return (
    <EntityStoreProvider id={props.id} spaceId={props.space}>
      <Page {...props} />
    </EntityStoreProvider>
  );
}

export const getServerSideProps: GetServerSideProps<Props> = async context => {
  const space = context.query.id as string;
  const entityId = context.query.entityId as string;

  return {
    props: {
      id: entityId,
      space,
      key: entityId,
    },
  };
};
