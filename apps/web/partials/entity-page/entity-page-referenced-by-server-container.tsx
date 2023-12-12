import { SYSTEM_IDS } from '@geogenesis/ids';

import { Environment } from '~/core/environment';
import { Subgraph } from '~/core/io';
import { Entity } from '~/core/utils/entity';
import { getRandomArrayItem, isPermissionlessSpace } from '~/core/utils/utils';

import { Skeleton } from '~/design-system/skeleton';
import { Spacer } from '~/design-system/spacer';
import { Text } from '~/design-system/text';

import { EntityPageReferencedBy } from './entity-page-referenced-by';
import { ReferencedByEntity } from './types';

interface Props {
  entityId: string;
  name: string | null;
  spaceId: string;
}

export async function EntityReferencedByServerContainer({ entityId, name, spaceId }: Props) {
  let config = Environment.getConfig(process.env.NEXT_PUBLIC_APP_ENV);

  const isPermissionless = isPermissionlessSpace(spaceId);

  if (isPermissionless) {
    config = {
      ...config,
      subgraph: config.permissionlessSubgraph,
    };
  }

  const [related, spaces] = await Promise.all([
    Subgraph.fetchEntities({
      query: '',
      filter: [{ field: 'linked-to', value: entityId }],
    }),
    Subgraph.fetchSpaces(),
  ]);

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

  return <EntityPageReferencedBy referencedByEntities={referencedByEntities} name={name} />;
}

export function EntityReferencedByLoading() {
  return (
    <div>
      <Text as="h2" variant="mediumTitle">
        Referenced by
      </Text>
      <Spacer height={20} />
      <div className="flex flex-col gap-6">
        <ReferencedBySkeletonItem />
        <ReferencedBySkeletonItem />
        <ReferencedBySkeletonItem />
      </div>
    </div>
  );
}

const POSITIONS = {
  top: ['w-36', 'w-24', 'w-40'],
  bottom: ['w-52', 'w-32', 'w-12'],
};

function ReferencedBySkeletonItem() {
  return (
    <div className="flex flex-col gap-2">
      <Skeleton className={`h-4 ${getRandomArrayItem(POSITIONS.top)}`} />
      <Skeleton className={`h-4 ${getRandomArrayItem(POSITIONS.bottom)}`} />
    </div>
  );
}
