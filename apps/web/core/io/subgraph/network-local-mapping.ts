import { Account, Action, Entity, OmitStrict, Profile, ProposedVersion, Space, Triple, Value } from '~/core/types';

export type NetworkSpace = {
  id: string;
  isRootSpace: boolean;
  admins: Account[];
  editors: Account[];
  editorControllers: Account[];
  entity?: {
    id: string;
    entityOf: { id: string; stringValue: string; attribute: { id: string } }[];
  };
  createdAtBlock: string;
};

type NetworkNumberValue = { valueType: 'NUMBER'; numberValue: string };

type NetworkStringValue = { valueType: 'STRING'; stringValue: string };

type NetworkImageValue = { valueType: 'IMAGE'; stringValue: string };

// Right now we can end up with a null entityValue until we handle triple validation on the subgraph
type NetworkEntityValue = { valueType: 'ENTITY'; entityValue: { id: string; name: string | null } };

type NetworkDateValue = { valueType: 'DATE'; stringValue: string };

type NetworkUrlValue = { valueType: 'URL'; stringValue: string };

type NetworkValue =
  | NetworkNumberValue
  | NetworkStringValue
  | NetworkEntityValue
  | NetworkImageValue
  | NetworkDateValue
  | NetworkUrlValue;

export type NetworkTriple = NetworkValue & {
  id: string;
  entity: { id: string; name: string | null };
  attribute: { id: string; name: string | null };
  valueId: string;
  isProtected: boolean;
  space: Space;
};

export type NetworkAction = OmitStrict<NetworkTriple, 'space' | 'isProtected'> &
  NetworkValue & {
    actionType: 'CREATE' | 'DELETE';
  };

export type SubstreamNetworkAction = OmitStrict<NetworkTriple, 'space' | 'isProtected'> &
  NetworkValue & {
    actionType: 'createTriple' | 'deleteTriple';
    // @TODO: This should be a reference
    entityValue: string | null;
  };

export type NetworkEntity = Entity & {
  entityOf: ({ space: Space } & NetworkTriple)[];
};

export type SubstreamNetworkEntity = Entity & {
  versionsByEntityId: { nodes: { tripleVersions: { nodes: { triple: NetworkTriple }[] } }[] };
};

export type SubstreamProposedVersion = OmitStrict<ProposedVersion, 'createdBy'> & {
  actions: { nodes: SubstreamNetworkAction[] };

  // The NetworkVersion does not have a name or avatar associated
  // with the createdBy field
  createdById: string;
};

export type SubstreamVersion = {
  id: string;
  name: string | null;
  description: string | null;
  createdById: string; // wallet address
  createdAt: number;
  createdAtBlock: string;
  spaceId: string;
  actions: { nodes: SubstreamNetworkAction[] };
  entity: {
    id: string;
    name: string;
  };
  tripleVersions: { nodes: { triple: NetworkTriple }[] };
};

export type NetworkProposedVersion = OmitStrict<ProposedVersion, 'createdBy'> & {
  actions: NetworkAction[];

  // The NetworkVersion does not have a name or avatar associated
  // with the createdBy field
  createdBy: {
    id: string;
  };
};

export type SubstreamProposal = {
  id: string;
  createdById: string;
  createdAt: number;
  createdAtBlock: string;
  name: string | null;
  description: string | null;
  spaceId: string;
  status: 'APPROVED';
  proposedVersions: { nodes: SubstreamProposedVersion[] };
};

export type NetworkProposal = {
  id: string;
  createdBy: {
    id: string;
  };
  createdAt: number;
  createdAtBlock: string;
  name: string | null;
  description: string | null;
  space: string;
  status: 'APPROVED';
  proposedVersions: NetworkProposedVersion[];
};

export function extractValue(networkTriple: NetworkTriple | NetworkAction): Value {
  switch (networkTriple.valueType) {
    case 'STRING':
      return { type: 'string', id: networkTriple.valueId, value: networkTriple.stringValue };
    case 'IMAGE':
      return { type: 'image', id: networkTriple.valueId, value: networkTriple.stringValue };
    case 'NUMBER':
      return { type: 'number', id: networkTriple.valueId, value: networkTriple.numberValue };
    case 'ENTITY':
      return {
        type: 'entity',
        id: networkTriple.entityValue.id,
        name: networkTriple.entityValue.name,
      };
    case 'DATE':
      return { type: 'date', id: networkTriple.valueId, value: networkTriple.stringValue };
    case 'URL':
      return { type: 'url', id: networkTriple.valueId, value: networkTriple.stringValue };
  }
}

export function extractActionValue(networkAction: SubstreamNetworkAction): Value {
  switch (networkAction.valueType) {
    case 'STRING':
      return { type: 'string', id: networkAction.valueId, value: networkAction.stringValue };
    case 'IMAGE':
      return { type: 'image', id: networkAction.valueId, value: networkAction.stringValue };
    case 'NUMBER':
      return { type: 'number', id: networkAction.valueId, value: networkAction.numberValue };
    case 'ENTITY':
      return {
        type: 'entity',
        id: networkAction.entityValue,
        name: null,
      };
    case 'DATE':
      return { type: 'date', id: networkAction.valueId, value: networkAction.stringValue };
    case 'URL':
      return { type: 'url', id: networkAction.valueId, value: networkAction.stringValue };
  }
}

export function getActionFromChangeStatus(action: Action) {
  switch (action.type) {
    case 'createTriple':
    case 'deleteTriple':
      return [action];

    case 'editTriple':
      return [action.before, action.after];
  }
}

function networkTripleHasEmptyValue(networkTriple: NetworkTriple | NetworkAction): boolean {
  switch (networkTriple.valueType) {
    case 'STRING':
      return !networkTriple.stringValue;
    case 'NUMBER':
      return !networkTriple.numberValue;
    case 'ENTITY':
      return !networkTriple.entityValue;
    case 'IMAGE':
      return !networkTriple.stringValue;
    case 'DATE':
      return !networkTriple.stringValue;
    case 'URL':
      return !networkTriple.stringValue;
  }
}

function substreamTripleHasEmptyValue(networkTriple: NetworkTriple | SubstreamNetworkAction): boolean {
  switch (networkTriple.valueType) {
    case 'STRING':
      return !networkTriple.stringValue;
    case 'NUMBER':
      return !networkTriple.numberValue;
    case 'ENTITY':
      return !networkTriple.entityValue;
    case 'IMAGE':
      return !networkTriple.stringValue;
    case 'DATE':
      return !networkTriple.stringValue;
    case 'URL':
      return !networkTriple.stringValue;
  }
}

function networkTripleHasEmptyAttribute(networkTriple: NetworkTriple | SubstreamNetworkAction): boolean {
  return !networkTriple.attribute || !networkTriple.attribute.id;
}

export function fromNetworkTriples(networkTriples: NetworkTriple[]): Triple[] {
  return (
    networkTriples
      // @TODO: Remove this once we have correct types for substreams triples value types.
      // Right now they are set as lowercase in the substream db, but uppercase in the subgraph.
      .map(
        networkTriple =>
          ({
            ...networkTriple,
            valueType: networkTriple.valueType.toUpperCase() as NetworkValue['valueType'],
          }) as NetworkTriple
      )
      .map(networkTriple => {
        // There's an edge-case bug where the value can be null even though it should be an object.
        // Right now we're not doing any triple validation, but once we do we will no longer be indexing
        // empty triples.
        if (networkTripleHasEmptyValue(networkTriple) || networkTripleHasEmptyAttribute(networkTriple)) {
          return null;
        }

        return {
          id: networkTriple.id,
          entityId: networkTriple.entity.id,
          entityName: networkTriple.entity.name,
          attributeId: networkTriple.attribute.id,
          attributeName: networkTriple.attribute.name,
          value: extractValue(networkTriple),
          space: networkTriple.space.id,
        };
      })
      .flatMap(triple => (triple ? [triple] : []))
  );
}

export function fromNetworkActions(
  networkActions: SubstreamNetworkAction[] | NetworkAction[],
  spaceId: string
): Action[] {
  try {
    const newActions = networkActions
      // @TODO: Remove this once we have correct types for substreams triples value types.
      // Right now they are set as lowercase in the substream db, but uppercase in the subgraph.
      .map(
        networkAction =>
          ({
            ...networkAction,
            valueType: networkAction.valueType.toUpperCase() as NetworkValue['valueType'],
          }) as SubstreamNetworkAction
      )
      .map(networkAction => {
        // There's an edge-case bug where the value can be null even though it should be an object.
        // Right now we're not doing any triple validation, but once we do we will no longer be indexing
        // empty triples. This is likely a result of very old data that does not map to the expected
        // type for value types.
        if (substreamTripleHasEmptyValue(networkAction) || networkTripleHasEmptyAttribute(networkAction)) {
          return null;
        }

        const value = extractActionValue(networkAction);

        switch (networkAction.actionType) {
          case 'createTriple': {
            return {
              type: 'createTriple' as const,
              id: networkAction.id,
              entityId: networkAction.entity.id,
              entityName: networkAction.entity.name,
              attributeId: networkAction.attribute.id,
              attributeName: networkAction.attribute.name,
              value,
              space: spaceId,
            };
          }

          case 'deleteTriple': {
            return {
              type: 'deleteTriple' as const,
              id: networkAction.id,
              entityId: networkAction.entity.id,
              entityName: networkAction.entity.name,
              attributeId: networkAction.attribute.id,
              attributeName: networkAction.attribute.name,
              value,
              space: spaceId,
            };
          }
        }
      })
      .flatMap(action => (action ? [action] : []));

    return newActions;
  } catch (e) {
    console.log('cannot map network actions', e);
    return [];
  }
}

/**
 * [
    {
        "id": "0xdd36b779fd25d8847840ee2b4953c8ace683cf04:0x206d1f64bb177e2732479186Ee5502D7202509D0–4:19b14c35-9149-4ec6-9ba0-f43480d1bf80:62761e6f-b06a-45ed-9bc6-9cb6f2b54d66",
        "attribute": {
            "id": "19b14c35-9149-4ec6-9ba0-f43480d1bf80",
            "name": "Space URL"
        },
        "entity": {
            "id": "0x206d1f64bb177e2732479186Ee5502D7202509D0–4",
            "name": "Nate Walpole"
        },
        "entityValue": null,
        "numberValue": null,
        "stringValue": "",
        "valueType": "string",
        "valueId": "62761e6f-b06a-45ed-9bc6-9cb6f2b54d66"
    },
    {
        "id": "0xdd36b779fd25d8847840ee2b4953c8ace683cf04:0x206d1f64bb177e2732479186Ee5502D7202509D0–4:19b14c35-9149-4ec6-9ba0-f43480d1bf80:9cdc16cd-8201-41a1-b506-8da17406a8ce",
        "attribute": {
            "id": "19b14c35-9149-4ec6-9ba0-f43480d1bf80",
            "name": "Space URL"
        },
        "entity": {
            "id": "0x206d1f64bb177e2732479186Ee5502D7202509D0–4",
            "name": "Nate Walpole"
        },
        "entityValue": null,
        "numberValue": null,
        "stringValue": "https://www.geobrowser.io/space/0xdd36b779fd25d8847840ee2b4953c8ace683cf04",
        "valueType": "url",
        "valueId": "9cdc16cd-8201-41a1-b506-8da17406a8ce"
    },
    {
        "id": "0xdd36b779fd25d8847840ee2b4953c8ace683cf04:0x206d1f64bb177e2732479186Ee5502D7202509D0–4:235ba0e8-dc7e-4bdd-a1e1-6d0d4497f133:75774780-158f-43f7-97bc-41d5f99de987",
        "attribute": {
            "id": "235ba0e8-dc7e-4bdd-a1e1-6d0d4497f133",
            "name": "Avatar"
        },
        "entity": {
            "id": "0x206d1f64bb177e2732479186Ee5502D7202509D0–4",
            "name": "Nate Walpole"
        },
        "entityValue": null,
        "numberValue": null,
        "stringValue": "ipfs://QmW1YWMTVKKfEsoH4NtPCbVeGXnvWNjsaQiRw8xLfPs91G",
        "valueType": "image",
        "valueId": "75774780-158f-43f7-97bc-41d5f99de987"
    },
    {
        "id": "0xdd36b779fd25d8847840ee2b4953c8ace683cf04:0x206d1f64bb177e2732479186Ee5502D7202509D0–4:34f53507-2e6b-42c5-a844-43981a77cfa2:385f736f-0005-4607-b9a6-e3332d96f030",
        "attribute": {
            "id": "34f53507-2e6b-42c5-a844-43981a77cfa2",
            "name": "Cover"
        },
        "entity": {
            "id": "0x206d1f64bb177e2732479186Ee5502D7202509D0–4",
            "name": "Nate Walpole"
        },
        "entityValue": null,
        "numberValue": null,
        "stringValue": "ipfs://QmVUNcstaUPyGdqV7xMBZ6uQbXFKq9s2uvEnVM8KxdGAy9",
        "valueType": "image",
        "valueId": "385f736f-0005-4607-b9a6-e3332d96f030"
    },
    {
        "id": "0xdd36b779fd25d8847840ee2b4953c8ace683cf04:0x206d1f64bb177e2732479186Ee5502D7202509D0–4:9038beb4-46ac-483b-8559-0a7e69b34d3c:e2ee7316-d787-40eb-88fb-4b57b39d81f8",
        "attribute": {
            "id": "9038beb4-46ac-483b-8559-0a7e69b34d3c",
            "name": "Role"
        },
        "entity": {
            "id": "0x206d1f64bb177e2732479186Ee5502D7202509D0–4",
            "name": "Nate Walpole"
        },
        "entityValue": {
            "id": "e2ee7316-d787-40eb-88fb-4b57b39d81f8",
            "name": "Designer"
        },
        "numberValue": null,
        "stringValue": null,
        "valueType": "entity",
        "valueId": "e2ee7316-d787-40eb-88fb-4b57b39d81f8"
    },
    {
        "id": "0xdd36b779fd25d8847840ee2b4953c8ace683cf04:0x206d1f64bb177e2732479186Ee5502D7202509D0–4:Description:c7c11a30-bddf-4cff-aad1-275138573349",
        "attribute": {
            "id": "Description",
            "name": "Description"
        },
        "entity": {
            "id": "0x206d1f64bb177e2732479186Ee5502D7202509D0–4",
            "name": "Nate Walpole"
        },
        "entityValue": null,
        "numberValue": null,
        "stringValue": "Nate is a designer at Geo.",
        "valueType": "string",
        "valueId": "c7c11a30-bddf-4cff-aad1-275138573349"
    },
    {
        "id": "0xdd36b779fd25d8847840ee2b4953c8ace683cf04:0x206d1f64bb177e2732479186Ee5502D7202509D0–4:beaba5cb-a677-41a8-b353-77030613fc70:42df2e24-539a-4668-a514-d352b3d25fd9",
        "attribute": {
            "id": "beaba5cb-a677-41a8-b353-77030613fc70",
            "name": "Blocks"
        },
        "entity": {
            "id": "0x206d1f64bb177e2732479186Ee5502D7202509D0–4",
            "name": "Nate Walpole"
        },
        "entityValue": null,
        "numberValue": null,
        "stringValue": "[\"0d17af48-931a-49b0-b87f-063477bc530e\",\"3f15ea80-5324-4c4e-806f-96a0068d9ede\",\"3061d794-51b2-40c8-97e7-de2e74ab6e30\"]",
        "valueType": "string",
        "valueId": "42df2e24-539a-4668-a514-d352b3d25fd9"
    },
    {
        "id": "0xdd36b779fd25d8847840ee2b4953c8ace683cf04:0x206d1f64bb177e2732479186Ee5502D7202509D0–4:name:64ffdfc5-d07c-4406-b428-fd2b64ee80e0",
        "attribute": {
            "id": "name",
            "name": "Name"
        },
        "entity": {
            "id": "0x206d1f64bb177e2732479186Ee5502D7202509D0–4",
            "name": "Nate Walpole"
        },
        "entityValue": null,
        "numberValue": null,
        "stringValue": "Nate Walpole",
        "valueType": "string",
        "valueId": "64ffdfc5-d07c-4406-b428-fd2b64ee80e0"
    },
    {
        "id": "0xdd36b779fd25d8847840ee2b4953c8ace683cf04:0x206d1f64bb177e2732479186Ee5502D7202509D0–4:type:af7ae93b-97d6-4aed-ad69-0c1d3da149a1",
        "attribute": {
            "id": "type",
            "name": "Types"
        },
        "entity": {
            "id": "0x206d1f64bb177e2732479186Ee5502D7202509D0–4",
            "name": "Nate Walpole"
        },
        "entityValue": {
            "id": "af7ae93b-97d6-4aed-ad69-0c1d3da149a1",
            "name": "Person"
        },
        "numberValue": null,
        "stringValue": null,
        "valueType": "entity",
        "valueId": "af7ae93b-97d6-4aed-ad69-0c1d3da149a1"
    }
]
 */
