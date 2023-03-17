import { fromNetworkActions, NetworkVersion } from '../network-local-mapping';

export function ReadIO(subgraphUrl: string) {
  return {
    versions: async (entityId: string, abortController?: AbortController) => {
      const response = await fetch(subgraphUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: abortController?.signal,
        body: JSON.stringify({
          query: `query {
            versions(where: {proposedVersion_: {entity: ${JSON.stringify(entityId)}}}) {
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
          versions: NetworkVersion[];
        };
        errors: any[];
      } = await response.json();

      try {
        console.log('json', { json });

        return json.data.versions.map(v => {
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
