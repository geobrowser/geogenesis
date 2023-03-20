import { fromNetworkActions, NetworkVersion } from '../network-local-mapping';

export function ReadIO(subgraphUrl: string) {
  return {
    proposedVersions: async (entityId: string, abortController?: AbortController) => {
      const response = await fetch(subgraphUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: abortController?.signal,
        body: JSON.stringify({
          query: `query {
            proposedVersions(where: {entity: ${JSON.stringify(entityId)}}, first: 10, sortBy: createdAt, orderDirection: desc) {
              id
              name
              createdAt
              createdBy {
                id
              }
              actions {
                actionType
                id
                attribute {
                  id
                  name
                }
                entity {
                  id
                  name
                }
                entityValue {
                  id
                  name
                }
                numberValue
                stringValue
                valueType
                valueId
              }
            }
          }`,
        }),
      });

      const json: {
        data: {
          proposedVersions: NetworkVersion[];
        };
        errors: any[];
      } = await response.json();

      try {
        return json.data.proposedVersions.map(v => {
          return {
            ...v,
            actions: fromNetworkActions(v.actions),
          };
        });
      } catch (e) {
        console.error(e);
        console.error(json.errors);
        return [];
      }
    },
  };
}
