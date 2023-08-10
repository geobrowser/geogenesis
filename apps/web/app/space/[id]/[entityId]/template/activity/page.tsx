import { SYSTEM_IDS } from '@geogenesis/ids';
import { cookies } from 'next/headers';
import Image from 'next/legacy/image';

import { Subgraph } from '~/core/io';
import { fetchProposalsByUser } from '~/core/io/fetch-proposals-by-user';
import { Params } from '~/core/params';
import { ServerSideEnvParams } from '~/core/types';
import { GeoDate, getImagePath } from '~/core/utils/utils';
import { Value } from '~/core/utils/value';

import { SmallButton } from '~/design-system/button';

export const runtime = 'edge';

interface Props {
  params: { id: string; entityId: string };
  searchParams: ServerSideEnvParams & {
    spaceId?: string;
  };
}

export default async function ActivityPage({ params, searchParams }: Props) {
  const env = cookies().get(Params.ENV_PARAM_NAME)?.value;
  const config = Params.getConfigFromParams(searchParams, env);

  const [personEntity, spaces] = await Promise.all([
    Subgraph.fetchEntity({
      endpoint: config.subgraph,
      id: params.entityId,
    }),
    Subgraph.fetchSpaces({
      endpoint: config.subgraph,
    }),
  ]);

  const firstWalletsTriple = personEntity?.triples.find(t => t.attributeId === SYSTEM_IDS.WALLETS_ATTRIBUTE);

  // Right now wallets are associated with an Entity. The name of the Entity is the address associated with
  // the wallet. Eventually this will get replaced by a proper Profile system.
  const userId = Value.nameOfEntityValue(firstWalletsTriple);

  if (!userId) return <p className="text-grey-04 text-body">There is no information here yet.</p>;

  const proposals = await fetchProposalsByUser({
    endpoint: config.subgraph,
    userId,
    spaceId: searchParams.spaceId,
    api: {
      fetchProfile: Subgraph.fetchProfile,
    },
  });

  if (proposals.length === 0) return <p className="text-grey-04 text-body">There is no information here yet.</p>;

  return (
    <div>
      <div className="flex items-center gap-2 w-full pb-3 border-b border-divider">
        <SmallButton variant="secondary" icon="chevronDownSmall">
          Proposals
        </SmallButton>
        <p>in</p>
        <SmallButton variant="secondary" icon="chevronDownSmall">
          All
        </SmallButton>
      </div>

      <div className="divide-y divide-divider">
        {proposals.map(p => {
          const space = spaces.find(s => s.id === p.space);
          const spaceImage = space?.attributes[SYSTEM_IDS.IMAGE_ATTRIBUTE] ?? '';

          const lastEditedDate = GeoDate.fromGeoTime(p.createdAt);

          // e.g. Mar 12, 2023
          const formattedLastEditedDate = new Date(lastEditedDate).toLocaleDateString(undefined, {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
          });

          return (
            <div key={p.id} className="flex w-full justify-between items-center">
              <div className="flex items-center gap-2">
                <div className="relative rounded-sm overflow-hidden h-4 w-4">
                  <Image objectFit="cover" priority layout="fill" src={getImagePath(spaceImage)} />
                </div>
                <p className="text-metadataMedium py-3">{p.name}</p>
              </div>
              <p className="text-metadataMedium tabular-nums text-grey-04">{formattedLastEditedDate}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
