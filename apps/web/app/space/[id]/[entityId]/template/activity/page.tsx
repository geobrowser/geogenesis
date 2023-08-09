import { SYSTEM_IDS } from '@geogenesis/ids';
import { cookies } from 'next/headers';

import { Subgraph } from '~/core/io';
import { fetchProposalsByUser } from '~/core/io/fetch-proposals-by-user';
import { Params } from '~/core/params';
import { ServerSideEnvParams } from '~/core/types';
import { Value } from '~/core/utils/value';

export const runtime = 'edge';

interface Props {
  params: { id: string; entityId: string };
  searchParams: ServerSideEnvParams;
}

export default async function ActivityPage({ params, searchParams }: Props) {
  const env = cookies().get(Params.ENV_PARAM_NAME)?.value;
  const config = Params.getConfigFromParams(searchParams, env);

  const personEntity = await Subgraph.fetchEntity({
    endpoint: config.subgraph,
    id: params.entityId,
  });

  const firstWalletsTriple = personEntity?.triples.find(t => t.attributeId === SYSTEM_IDS.WALLETS_ATTRIBUTE);

  // Right now wallets are associated with an Entity. The name of the Entity is the address associated with
  // the wallet. Eventually this will get replaced by a proper Profile system.
  const userId = Value.nameOfEntityValue(firstWalletsTriple);

  if (!userId) return <p className="text-grey-04 text-body">There is no information here yet.</p>;

  const proposals = await fetchProposalsByUser({
    endpoint: config.subgraph,
    userId,
    api: {
      fetchProfile: Subgraph.fetchProfile,
    },
  });

  if (proposals.length === 0) return <p className="text-grey-04 text-body">There is no information here yet.</p>;

  return (
    <div className="divide-y divide-divider">
      {proposals.map(p => (
        <p key={p.id} className="text-metadataMedium py-3">
          {p.name}
        </p>
      ))}
    </div>
  );
}
