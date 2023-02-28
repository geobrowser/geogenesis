import { GetServerSideProps } from 'next';
import { Spacer } from '~/modules/design-system/spacer';
import { Params } from '~/modules/params';
import { EntityValue, Proposal, StringValue } from '~/modules/types';

interface Props {
  proposals: Proposal[];
}

function fromValueType(value: EntityValue | StringValue) {
  switch (value.type) {
    case 'entity':
      return value.id;
    case 'string':
      return value.value;
  }
}

/**
 * @TODO
 * 1. We are currently just storing the JSON, but we may want to actually index the actions so they're easy to query.
 *    This also maps them closer to the triples format that the app is already using. This also makes it easy to
 *    get the name of entities for triples and relation values.
 * 2. We need to do a better job of getting the first and last changes for a triple before publishing.
 *    Should we encode a before/after in the subgraph when editing a triple? This will make it easier to do diffs.
 */
export default function Proposals({ proposals }: Props) {
  proposals.map(p => console.log(`${p.id}: `, JSON.parse(p.json)));

  return (
    <ul className="space-y-8">
      {proposals.map(p => (
        <li key={p.id}>
          <p className="flex flex-col">
            <span className="font-medium">Proposal id:</span>
            <span>{p.name === '' ? p.id : p.name}</span>
          </p>
          <Spacer height={8} />
          <p className="flex flex-col">
            <span className="font-medium">Changed values in proposal:</span>
            {JSON.parse(p.json).actions.map(a => (
              <div className="flex gap-4">
                <span>entity id: {a.entityId}</span>
                <span>attribute id: {a.attributeId}</span>
                <span key={a.id}>value: {fromValueType(a.value)}</span>
              </div>
            ))}
          </p>
        </li>
      ))}
    </ul>
  );
}

export const getServerSideProps: GetServerSideProps<Props> = async context => {
  // const entityId = context.query.entityId as string;
  const config = Params.getConfigFromUrl(context.resolvedUrl, context.req.cookies[Params.ENV_PARAM_NAME]);
  // const storage = new StorageClient(config.ipfs);

  const network = Network(config.subgraph);
  const proposals = await network.proposals();

  console.log('proposals', proposals);

  return {
    props: {
      proposals,
    },
  };
};

function Network(subgraphUrl: string) {
  return {
    async proposals(): Promise<Proposal[]> {
      const response = await fetch(subgraphUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: `query {
            proposals {
              id
              name,
              description,
              json
            }
          }`,
        }),
      });

      const result: {
        data: {
          proposals: Proposal[];
        };
      } = await response.json();
      return result.data.proposals;
    },
  };
}
