import { FINANCE_OVERVIEW_TYPE } from '@geogenesis/ids/system-ids';

import { Subgraph } from '~/core/io';

import { NoContent } from '~/partials/space-tabs/no-content';

import DefaultEntityPage from '../../(entity)/[id]/[entityId]/default-entity-page';

type FinancesPageProps = {
  params: { id: string; entityId: string };
  searchParams: {
    typeId?: string;
    filters?: string;
  };
};

export default async function FinancesPage({ params, searchParams }: FinancesPageProps) {
  const spaceId = params.id;
  const finances = await getFinances(spaceId);

  if (!finances) {
    return (
      <NoContent
        isEditing={false}
        options={{
          browse: {
            title: 'There are no financial summaries here yet',
            description: 'Switch to edit mode to add your finances if you’re an editor of this space!',
            image: '/finances.png',
          },
        }}
      />
    );
  }

  return (
    <DefaultEntityPage
      params={{ id: spaceId, entityId: finances.id }}
      searchParams={searchParams}
      showCover={false}
      showHeading={false}
      showHeader={false}
    />
  );
}

const getFinances = async (spaceId: string) => {
  const [financesEntity] = await Subgraph.fetchEntities({
    spaceId,
    typeIds: [FINANCE_OVERVIEW_TYPE],
    filter: [],
  });

  if (financesEntity) {
    return financesEntity;
  }

  return null;
};
