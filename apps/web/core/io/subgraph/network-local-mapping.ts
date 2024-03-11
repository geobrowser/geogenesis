import { Action, Entity, OmitStrict, ProposedVersion, Space, Triple, Value, Vote } from '~/core/types';

type NetworkNumberValue = { valueType: 'number'; numberValue: string };

type NetworkStringValue = { valueType: 'string'; stringValue: string };

type NetworkImageValue = { valueType: 'image'; stringValue: string };

// Right now we can end up with a null entityValue until we handle triple validation on the subgraph
type NetworkEntityValue = { valueType: 'entity'; entityValue: { id: string; name: string | null } };

type NetworkDateValue = { valueType: 'date'; stringValue: string };

type NetworkUrlValue = { valueType: 'url'; stringValue: string };

type NetworkValue =
  | NetworkNumberValue
  | NetworkStringValue
  | NetworkEntityValue
  | NetworkImageValue
  | NetworkDateValue
  | NetworkUrlValue;

export type SubstreamTriple = NetworkValue & {
  id: string;
  entity: { id: string; name: string | null };
  attribute: { id: string; name: string | null };
  valueId: string;
  isProtected: boolean;
  space: Space;
};

export type SubstreamAction = OmitStrict<SubstreamTriple, 'space' | 'isProtected'> &
  NetworkValue & {
    actionType: 'createTriple' | 'deleteTriple';
    // @TODO: This should be a reference
    entityValue: string | null;
  };

export type SubstreamEntity = OmitStrict<Entity, 'triples'> & {
  // versionsByEntityId: { nodes: { tripleVersions: { nodes: { triple: NetworkTriple }[] } }[] };
  triplesByEntityId: { nodes: SubstreamTriple[] };
};

export type SubstreamProposedVersion = OmitStrict<ProposedVersion, 'createdBy'> & {
  actions: { nodes: SubstreamAction[] };

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
  tripleVersions: { nodes: { triple: SubstreamTriple }[] };
  entity: {
    id: string;
    name: string;
  };
};

export type SubstreamProposal = {
  id: string;
  onchainProposalId: string;
  createdById: string;
  createdAt: number;
  createdAtBlock: string;
  name: string | null;
  description: string | null;
  spaceId: string;
  startTime: number;
  endTime: number;
  status: 'APPROVED';
  proposalVotes: { nodes: Vote[]; totalCount: number };
  proposedVersions: { nodes: SubstreamProposedVersion[] };
};

export function extractValue(networkTriple: SubstreamTriple | SubstreamAction): Value {
  switch (networkTriple.valueType) {
    case 'string':
      return { type: 'string', id: networkTriple.valueId, value: networkTriple.stringValue };
    case 'image':
      return { type: 'image', id: networkTriple.valueId, value: networkTriple.stringValue };
    case 'number':
      return { type: 'number', id: networkTriple.valueId, value: networkTriple.numberValue };
    case 'entity':
      return {
        type: 'entity',
        id: networkTriple.entityValue.id,
        name: networkTriple.entityValue.name,
      };
    case 'date':
      return { type: 'date', id: networkTriple.valueId, value: networkTriple.stringValue };
    case 'url':
      return { type: 'url', id: networkTriple.valueId, value: networkTriple.stringValue };
  }
}

export function extractActionValue(networkAction: SubstreamAction): Value {
  switch (networkAction.valueType) {
    case 'string':
      return { type: 'string', id: networkAction.valueId, value: networkAction.stringValue };
    case 'image':
      return { type: 'image', id: networkAction.valueId, value: networkAction.stringValue };
    case 'number':
      return { type: 'number', id: networkAction.valueId, value: networkAction.numberValue };
    case 'entity':
      return {
        type: 'entity',
        id: networkAction.entityValue,
        name: null,
      };
    case 'date':
      return { type: 'date', id: networkAction.valueId, value: networkAction.stringValue };
    case 'url':
      return { type: 'url', id: networkAction.valueId, value: networkAction.stringValue };
  }

  console.log('networkAction', networkAction);
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

function networkTripleHasEmptyValue(networkTriple: SubstreamTriple | SubstreamAction): boolean {
  switch (networkTriple.valueType) {
    case 'string':
      return !networkTriple.stringValue;
    case 'number':
      return !networkTriple.numberValue;
    case 'entity':
      return !networkTriple.entityValue;
    case 'image':
      return !networkTriple.stringValue;
    case 'date':
      return !networkTriple.stringValue;
    case 'url':
      return !networkTriple.stringValue;
  }
}

function substreamTripleHasEmptyValue(networkTriple: SubstreamAction): boolean {
  switch (networkTriple.valueType) {
    case 'string':
      return !networkTriple.stringValue;
    case 'number':
      return !networkTriple.numberValue;
    case 'entity':
      return !networkTriple.entityValue;
    case 'image':
      return !networkTriple.stringValue;
    case 'date':
      return !networkTriple.stringValue;
    case 'url':
      return !networkTriple.stringValue;
  }
}

function networkTripleHasEmptyAttribute(networkTriple: SubstreamAction | SubstreamTriple): boolean {
  return !networkTriple.attribute || !networkTriple.attribute.id;
}

export function fromNetworkTriples(networkTriples: SubstreamTriple[]): Triple[] {
  return networkTriples
    .map((networkTriple, i) => {
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
    .flatMap(triple => (triple ? [triple] : []));
}

export function fromNetworkActions(networkActions: SubstreamAction[], spaceId: string): Action[] {
  try {
    const newActions = networkActions
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
        "id": "0x1A39E2Fe299Ef8f855ce43abF7AC85D6e69E05F5:51661ff1-1f41-4224-a915-452385f238a4:235ba0e8-dc7e-4bdd-a1e1-6d0d4497f133:0x1A39E2Fe299Ef8f855ce43abF7AC85D6e69E05F5:51661ff1-1f41-4224-a915-452385f238a4:235ba0e8-dc7e-4bdd-a1e1-6d0d4497f133:009fafca-dff0-4a5b-a2e2-d1b9448763be",
        "attribute": {
            "id": "235ba0e8-dc7e-4bdd-a1e1-6d0d4497f133",
            "name": "Avatar"
        },
        "entity": {
            "id": "51661ff1-1f41-4224-a915-452385f238a4",
            "name": "The Graph"
        },
        "entityValue": null,
        "numberValue": null,
        "stringValue": "ipfs://QmeBFcFRV71uzQWFLYqXn5LbzGx9Mtm3DUPEr4duX1LLS8",
        "valueType": "image",
        "valueId": "0x1A39E2Fe299Ef8f855ce43abF7AC85D6e69E05F5:51661ff1-1f41-4224-a915-452385f238a4:235ba0e8-dc7e-4bdd-a1e1-6d0d4497f133:009fafca-dff0-4a5b-a2e2-d1b9448763be"
    },
    {
        "id": "0x1A39E2Fe299Ef8f855ce43abF7AC85D6e69E05F5:51661ff1-1f41-4224-a915-452385f238a4:2faf5515-2ec8-4d6e-ac9d-11f6d06a57da:1c7e938b-939f-44d0-9e59-a6ad03527020",
        "attribute": {
            "id": "2faf5515-2ec8-4d6e-ac9d-11f6d06a57da",
            "name": "Categories"
        },
        "entity": {
            "id": "51661ff1-1f41-4224-a915-452385f238a4",
            "name": "The Graph"
        },
        "entityValue": {
            "id": "1c7e938b-939f-44d0-9e59-a6ad03527020",
            "name": "Web3"
        },
        "numberValue": null,
        "stringValue": null,
        "valueType": "entity",
        "valueId": "1c7e938b-939f-44d0-9e59-a6ad03527020"
    },
    {
        "id": "0x1A39E2Fe299Ef8f855ce43abF7AC85D6e69E05F5:51661ff1-1f41-4224-a915-452385f238a4:2faf5515-2ec8-4d6e-ac9d-11f6d06a57da:1ea87edf-2483-48b2-9270-24726cd24115",
        "attribute": {
            "id": "2faf5515-2ec8-4d6e-ac9d-11f6d06a57da",
            "name": "Categories"
        },
        "entity": {
            "id": "51661ff1-1f41-4224-a915-452385f238a4",
            "name": "The Graph"
        },
        "entityValue": {
            "id": "1ea87edf-2483-48b2-9270-24726cd24115",
            "name": "Analytics"
        },
        "numberValue": null,
        "stringValue": null,
        "valueType": "entity",
        "valueId": "1ea87edf-2483-48b2-9270-24726cd24115"
    },
    {
        "id": "0x1A39E2Fe299Ef8f855ce43abF7AC85D6e69E05F5:51661ff1-1f41-4224-a915-452385f238a4:2faf5515-2ec8-4d6e-ac9d-11f6d06a57da:62a9e150-53c3-422c-b309-67ddd041bcba",
        "attribute": {
            "id": "2faf5515-2ec8-4d6e-ac9d-11f6d06a57da",
            "name": "Categories"
        },
        "entity": {
            "id": "51661ff1-1f41-4224-a915-452385f238a4",
            "name": "The Graph"
        },
        "entityValue": {
            "id": "62a9e150-53c3-422c-b309-67ddd041bcba",
            "name": "Data"
        },
        "numberValue": null,
        "stringValue": null,
        "valueType": "entity",
        "valueId": "62a9e150-53c3-422c-b309-67ddd041bcba"
    },
    {
        "id": "0x1A39E2Fe299Ef8f855ce43abF7AC85D6e69E05F5:51661ff1-1f41-4224-a915-452385f238a4:2faf5515-2ec8-4d6e-ac9d-11f6d06a57da:a6eba5aa-2cd4-4663-b6ab-12f571e32577",
        "attribute": {
            "id": "2faf5515-2ec8-4d6e-ac9d-11f6d06a57da",
            "name": "Categories"
        },
        "entity": {
            "id": "51661ff1-1f41-4224-a915-452385f238a4",
            "name": "The Graph"
        },
        "entityValue": {
            "id": "a6eba5aa-2cd4-4663-b6ab-12f571e32577",
            "name": "APIs"
        },
        "numberValue": null,
        "stringValue": null,
        "valueType": "entity",
        "valueId": "a6eba5aa-2cd4-4663-b6ab-12f571e32577"
    },
    {
        "id": "0x1A39E2Fe299Ef8f855ce43abF7AC85D6e69E05F5:51661ff1-1f41-4224-a915-452385f238a4:2faf5515-2ec8-4d6e-ac9d-11f6d06a57da:e15976ec-e756-4c5c-b8cc-276c1d57da10",
        "attribute": {
            "id": "2faf5515-2ec8-4d6e-ac9d-11f6d06a57da",
            "name": "Categories"
        },
        "entity": {
            "id": "51661ff1-1f41-4224-a915-452385f238a4",
            "name": "The Graph"
        },
        "entityValue": {
            "id": "e15976ec-e756-4c5c-b8cc-276c1d57da10",
            "name": "Infrastructure"
        },
        "numberValue": null,
        "stringValue": null,
        "valueType": "entity",
        "valueId": "e15976ec-e756-4c5c-b8cc-276c1d57da10"
    },
    {
        "id": "0x1A39E2Fe299Ef8f855ce43abF7AC85D6e69E05F5:51661ff1-1f41-4224-a915-452385f238a4:34f53507-2e6b-42c5-a844-43981a77cfa2:0x1A39E2Fe299Ef8f855ce43abF7AC85D6e69E05F5:51661ff1-1f41-4224-a915-452385f238a4:34f53507-2e6b-42c5-a844-43981a77cfa2:5f0323e8-cfb8-4258-8ff3-906cee8a6e17",
        "attribute": {
            "id": "34f53507-2e6b-42c5-a844-43981a77cfa2",
            "name": "Cover"
        },
        "entity": {
            "id": "51661ff1-1f41-4224-a915-452385f238a4",
            "name": "The Graph"
        },
        "entityValue": null,
        "numberValue": null,
        "stringValue": "ipfs://QmdikoWzaU2xrc1DGhSjs7mQVGFDMt2CRAJiq7JfFqhEcU",
        "valueType": "image",
        "valueId": "0x1A39E2Fe299Ef8f855ce43abF7AC85D6e69E05F5:51661ff1-1f41-4224-a915-452385f238a4:34f53507-2e6b-42c5-a844-43981a77cfa2:5f0323e8-cfb8-4258-8ff3-906cee8a6e17"
    },
    {
        "id": "0x1A39E2Fe299Ef8f855ce43abF7AC85D6e69E05F5:51661ff1-1f41-4224-a915-452385f238a4:71a5569e-688e-4e0f-8eb0-d8c361211e7c:0x1A39E2Fe299Ef8f855ce43abF7AC85D6e69E05F5:51661ff1-1f41-4224-a915-452385f238a4:71a5569e-688e-4e0f-8eb0-d8c361211e7c:d2e98993-8898-4858-8152-b66da61a7a7e",
        "attribute": {
            "id": "71a5569e-688e-4e0f-8eb0-d8c361211e7c",
            "name": "Twitter"
        },
        "entity": {
            "id": "51661ff1-1f41-4224-a915-452385f238a4",
            "name": "The Graph"
        },
        "entityValue": null,
        "numberValue": null,
        "stringValue": "https://twitter.com/graphprotocol",
        "valueType": "url",
        "valueId": "0x1A39E2Fe299Ef8f855ce43abF7AC85D6e69E05F5:51661ff1-1f41-4224-a915-452385f238a4:71a5569e-688e-4e0f-8eb0-d8c361211e7c:d2e98993-8898-4858-8152-b66da61a7a7e"
    },
    {
        "id": "0x1A39E2Fe299Ef8f855ce43abF7AC85D6e69E05F5:51661ff1-1f41-4224-a915-452385f238a4:911b5ea0-2582-458d-9e60-1b3d24c9d2d1:d3f6cf33-9371-41eb-8d00-a53f687966c5",
        "attribute": {
            "id": "911b5ea0-2582-458d-9e60-1b3d24c9d2d1",
            "name": "Chain"
        },
        "entity": {
            "id": "51661ff1-1f41-4224-a915-452385f238a4",
            "name": "The Graph"
        },
        "entityValue": {
            "id": "d3f6cf33-9371-41eb-8d00-a53f687966c5",
            "name": "Ethereum"
        },
        "numberValue": null,
        "stringValue": null,
        "valueType": "entity",
        "valueId": "d3f6cf33-9371-41eb-8d00-a53f687966c5"
    },
    {
        "id": "0x1A39E2Fe299Ef8f855ce43abF7AC85D6e69E05F5:51661ff1-1f41-4224-a915-452385f238a4:9d321644-a36b-4a4c-9ced-6d7ac247b9f7:07314222-4521-434b-9bc2-1644e5c9e47e",
        "attribute": {
            "id": "9d321644-a36b-4a4c-9ced-6d7ac247b9f7",
            "name": "Subgraphs"
        },
        "entity": {
            "id": "51661ff1-1f41-4224-a915-452385f238a4",
            "name": "The Graph"
        },
        "entityValue": {
            "id": "07314222-4521-434b-9bc2-1644e5c9e47e",
            "name": "Graph Network Goerli"
        },
        "numberValue": null,
        "stringValue": null,
        "valueType": "entity",
        "valueId": "07314222-4521-434b-9bc2-1644e5c9e47e"
    },
    {
        "id": "0x1A39E2Fe299Ef8f855ce43abF7AC85D6e69E05F5:51661ff1-1f41-4224-a915-452385f238a4:9d321644-a36b-4a4c-9ced-6d7ac247b9f7:0820b865-9592-4b9f-b0e2-f93e8ba4d2b4",
        "attribute": {
            "id": "9d321644-a36b-4a4c-9ced-6d7ac247b9f7",
            "name": "Subgraphs"
        },
        "entity": {
            "id": "51661ff1-1f41-4224-a915-452385f238a4",
            "name": "The Graph"
        },
        "entityValue": {
            "id": "0820b865-9592-4b9f-b0e2-f93e8ba4d2b4",
            "name": "Graph Network Arbitrum"
        },
        "numberValue": null,
        "stringValue": null,
        "valueType": "entity",
        "valueId": "0820b865-9592-4b9f-b0e2-f93e8ba4d2b4"
    },
    {
        "id": "0x1A39E2Fe299Ef8f855ce43abF7AC85D6e69E05F5:51661ff1-1f41-4224-a915-452385f238a4:9d321644-a36b-4a4c-9ced-6d7ac247b9f7:32ec661c-41b0-4bfc-abf3-cc09061a1654",
        "attribute": {
            "id": "9d321644-a36b-4a4c-9ced-6d7ac247b9f7",
            "name": "Subgraphs"
        },
        "entity": {
            "id": "51661ff1-1f41-4224-a915-452385f238a4",
            "name": "The Graph"
        },
        "entityValue": {
            "id": "32ec661c-41b0-4bfc-abf3-cc09061a1654",
            "name": "Graph Network Arbitrum Staging"
        },
        "numberValue": null,
        "stringValue": null,
        "valueType": "entity",
        "valueId": "32ec661c-41b0-4bfc-abf3-cc09061a1654"
    },
    {
        "id": "0x1A39E2Fe299Ef8f855ce43abF7AC85D6e69E05F5:51661ff1-1f41-4224-a915-452385f238a4:9d321644-a36b-4a4c-9ced-6d7ac247b9f7:35210eba-e387-4927-95f9-17532c12d680",
        "attribute": {
            "id": "9d321644-a36b-4a4c-9ced-6d7ac247b9f7",
            "name": "Subgraphs"
        },
        "entity": {
            "id": "51661ff1-1f41-4224-a915-452385f238a4",
            "name": "The Graph"
        },
        "entityValue": {
            "id": "35210eba-e387-4927-95f9-17532c12d680",
            "name": "Graph Network Mainnet"
        },
        "numberValue": null,
        "stringValue": null,
        "valueType": "entity",
        "valueId": "35210eba-e387-4927-95f9-17532c12d680"
    },
    {
        "id": "0x1A39E2Fe299Ef8f855ce43abF7AC85D6e69E05F5:51661ff1-1f41-4224-a915-452385f238a4:9d321644-a36b-4a4c-9ced-6d7ac247b9f7:5f4d1559-8a9d-4e7d-84ef-93483313d4fc",
        "attribute": {
            "id": "9d321644-a36b-4a4c-9ced-6d7ac247b9f7",
            "name": "Subgraphs"
        },
        "entity": {
            "id": "51661ff1-1f41-4224-a915-452385f238a4",
            "name": "The Graph"
        },
        "entityValue": {
            "id": "5f4d1559-8a9d-4e7d-84ef-93483313d4fc",
            "name": "Subscriptions Arbitrum One"
        },
        "numberValue": null,
        "stringValue": null,
        "valueType": "entity",
        "valueId": "5f4d1559-8a9d-4e7d-84ef-93483313d4fc"
    },
    {
        "id": "0x1A39E2Fe299Ef8f855ce43abF7AC85D6e69E05F5:51661ff1-1f41-4224-a915-452385f238a4:9d321644-a36b-4a4c-9ced-6d7ac247b9f7:72d87e65-1b7f-4ed4-890e-811d89dde388",
        "attribute": {
            "id": "9d321644-a36b-4a4c-9ced-6d7ac247b9f7",
            "name": "Subgraphs"
        },
        "entity": {
            "id": "51661ff1-1f41-4224-a915-452385f238a4",
            "name": "The Graph"
        },
        "entityValue": {
            "id": "72d87e65-1b7f-4ed4-890e-811d89dde388",
            "name": "Compound V2"
        },
        "numberValue": null,
        "stringValue": null,
        "valueType": "entity",
        "valueId": "72d87e65-1b7f-4ed4-890e-811d89dde388"
    },
    {
        "id": "0x1A39E2Fe299Ef8f855ce43abF7AC85D6e69E05F5:51661ff1-1f41-4224-a915-452385f238a4:9d321644-a36b-4a4c-9ced-6d7ac247b9f7:89515586-bfb7-46db-9dd3-8953cfa097a4",
        "attribute": {
            "id": "9d321644-a36b-4a4c-9ced-6d7ac247b9f7",
            "name": "Subgraphs"
        },
        "entity": {
            "id": "51661ff1-1f41-4224-a915-452385f238a4",
            "name": "The Graph"
        },
        "entityValue": {
            "id": "89515586-bfb7-46db-9dd3-8953cfa097a4",
            "name": "Graph Network Arbitrum Goerli"
        },
        "numberValue": null,
        "stringValue": null,
        "valueType": "entity",
        "valueId": "89515586-bfb7-46db-9dd3-8953cfa097a4"
    },
    {
        "id": "0x1A39E2Fe299Ef8f855ce43abF7AC85D6e69E05F5:51661ff1-1f41-4224-a915-452385f238a4:9d321644-a36b-4a4c-9ced-6d7ac247b9f7:b54fce53-daa7-4992-bd97-237232ab6b86",
        "attribute": {
            "id": "9d321644-a36b-4a4c-9ced-6d7ac247b9f7",
            "name": "Subgraphs"
        },
        "entity": {
            "id": "51661ff1-1f41-4224-a915-452385f238a4",
            "name": "The Graph"
        },
        "entityValue": {
            "id": "b54fce53-daa7-4992-bd97-237232ab6b86",
            "name": "Uniswap"
        },
        "numberValue": null,
        "stringValue": null,
        "valueType": "entity",
        "valueId": "b54fce53-daa7-4992-bd97-237232ab6b86"
    },
    {
        "id": "0x1A39E2Fe299Ef8f855ce43abF7AC85D6e69E05F5:51661ff1-1f41-4224-a915-452385f238a4:9d321644-a36b-4a4c-9ced-6d7ac247b9f7:d2a3b8b4-416e-49cf-af4d-197b158cd620",
        "attribute": {
            "id": "9d321644-a36b-4a4c-9ced-6d7ac247b9f7",
            "name": "Subgraphs"
        },
        "entity": {
            "id": "51661ff1-1f41-4224-a915-452385f238a4",
            "name": "The Graph"
        },
        "entityValue": {
            "id": "d2a3b8b4-416e-49cf-af4d-197b158cd620",
            "name": "Graph Network Mainnet"
        },
        "numberValue": null,
        "stringValue": null,
        "valueType": "entity",
        "valueId": "d2a3b8b4-416e-49cf-af4d-197b158cd620"
    },
    {
        "id": "0x1A39E2Fe299Ef8f855ce43abF7AC85D6e69E05F5:51661ff1-1f41-4224-a915-452385f238a4:ae2877be-b2be-4024-95ca-cae3c44f2e3b:a98886d7-1f14-4415-8a72-a52c02f91e80",
        "attribute": {
            "id": "ae2877be-b2be-4024-95ca-cae3c44f2e3b",
            "name": "Asset"
        },
        "entity": {
            "id": "51661ff1-1f41-4224-a915-452385f238a4",
            "name": "The Graph"
        },
        "entityValue": {
            "id": "a98886d7-1f14-4415-8a72-a52c02f91e80",
            "name": "GRT"
        },
        "numberValue": null,
        "stringValue": null,
        "valueType": "entity",
        "valueId": "a98886d7-1f14-4415-8a72-a52c02f91e80"
    },
    {
        "id": "0x1A39E2Fe299Ef8f855ce43abF7AC85D6e69E05F5:51661ff1-1f41-4224-a915-452385f238a4:beaba5cb-a677-41a8-b353-77030613fc70:b1366059-9a68-49fc-8010-5a9eb149043b",
        "attribute": {
            "id": "beaba5cb-a677-41a8-b353-77030613fc70",
            "name": "Blocks"
        },
        "entity": {
            "id": "51661ff1-1f41-4224-a915-452385f238a4",
            "name": "The Graph"
        },
        "entityValue": null,
        "numberValue": null,
        "stringValue": "[\"277b3d19-50a7-45b6-bbe2-91e53756d4cb\"]",
        "valueType": "string",
        "valueId": "b1366059-9a68-49fc-8010-5a9eb149043b"
    },
    {
        "id": "0x1A39E2Fe299Ef8f855ce43abF7AC85D6e69E05F5:51661ff1-1f41-4224-a915-452385f238a4:de4a2179-b903-4128-9602-ff3bf5efff97:0a22a6f5-e59b-4f91-9a97-6b36af5359fc",
        "attribute": {
            "id": "de4a2179-b903-4128-9602-ff3bf5efff97",
            "name": "Core devs"
        },
        "entity": {
            "id": "51661ff1-1f41-4224-a915-452385f238a4",
            "name": "The Graph"
        },
        "entityValue": {
            "id": "0a22a6f5-e59b-4f91-9a97-6b36af5359fc",
            "name": "StreamingFast"
        },
        "numberValue": null,
        "stringValue": null,
        "valueType": "entity",
        "valueId": "0a22a6f5-e59b-4f91-9a97-6b36af5359fc"
    },
    {
        "id": "0x1A39E2Fe299Ef8f855ce43abF7AC85D6e69E05F5:51661ff1-1f41-4224-a915-452385f238a4:de4a2179-b903-4128-9602-ff3bf5efff97:0d135120-f718-465b-a1ef-d767fc96dcda",
        "attribute": {
            "id": "de4a2179-b903-4128-9602-ff3bf5efff97",
            "name": "Core devs"
        },
        "entity": {
            "id": "51661ff1-1f41-4224-a915-452385f238a4",
            "name": "The Graph"
        },
        "entityValue": {
            "id": "0d135120-f718-465b-a1ef-d767fc96dcda",
            "name": "GraphOps"
        },
        "numberValue": null,
        "stringValue": null,
        "valueType": "entity",
        "valueId": "0d135120-f718-465b-a1ef-d767fc96dcda"
    },
    {
        "id": "0x1A39E2Fe299Ef8f855ce43abF7AC85D6e69E05F5:51661ff1-1f41-4224-a915-452385f238a4:de4a2179-b903-4128-9602-ff3bf5efff97:187d5059-39cc-4ede-b33c-a7d6323f2ef3",
        "attribute": {
            "id": "de4a2179-b903-4128-9602-ff3bf5efff97",
            "name": "Core devs"
        },
        "entity": {
            "id": "51661ff1-1f41-4224-a915-452385f238a4",
            "name": "The Graph"
        },
        "entityValue": {
            "id": "187d5059-39cc-4ede-b33c-a7d6323f2ef3",
            "name": "Messari"
        },
        "numberValue": null,
        "stringValue": null,
        "valueType": "entity",
        "valueId": "187d5059-39cc-4ede-b33c-a7d6323f2ef3"
    },
    {
        "id": "0x1A39E2Fe299Ef8f855ce43abF7AC85D6e69E05F5:51661ff1-1f41-4224-a915-452385f238a4:de4a2179-b903-4128-9602-ff3bf5efff97:6b797212-160e-432c-83bb-2d17c41629a1",
        "attribute": {
            "id": "de4a2179-b903-4128-9602-ff3bf5efff97",
            "name": "Core devs"
        },
        "entity": {
            "id": "51661ff1-1f41-4224-a915-452385f238a4",
            "name": "The Graph"
        },
        "entityValue": {
            "id": "6b797212-160e-432c-83bb-2d17c41629a1",
            "name": "The Guild"
        },
        "numberValue": null,
        "stringValue": null,
        "valueType": "entity",
        "valueId": "6b797212-160e-432c-83bb-2d17c41629a1"
    },
    {
        "id": "0x1A39E2Fe299Ef8f855ce43abF7AC85D6e69E05F5:51661ff1-1f41-4224-a915-452385f238a4:de4a2179-b903-4128-9602-ff3bf5efff97:a369bfb8-286f-49fb-aad4-3a67761702d6",
        "attribute": {
            "id": "de4a2179-b903-4128-9602-ff3bf5efff97",
            "name": "Core devs"
        },
        "entity": {
            "id": "51661ff1-1f41-4224-a915-452385f238a4",
            "name": "The Graph"
        },
        "entityValue": {
            "id": "a369bfb8-286f-49fb-aad4-3a67761702d6",
            "name": "Edge & Node"
        },
        "numberValue": null,
        "stringValue": null,
        "valueType": "entity",
        "valueId": "a369bfb8-286f-49fb-aad4-3a67761702d6"
    },
    {
        "id": "0x1A39E2Fe299Ef8f855ce43abF7AC85D6e69E05F5:51661ff1-1f41-4224-a915-452385f238a4:de4a2179-b903-4128-9602-ff3bf5efff97:bf061ad5-72e2-4ff2-8c88-4b2411bd616d",
        "attribute": {
            "id": "de4a2179-b903-4128-9602-ff3bf5efff97",
            "name": "Core devs"
        },
        "entity": {
            "id": "51661ff1-1f41-4224-a915-452385f238a4",
            "name": "The Graph"
        },
        "entityValue": {
            "id": "bf061ad5-72e2-4ff2-8c88-4b2411bd616d",
            "name": "Semiotic Labs"
        },
        "numberValue": null,
        "stringValue": null,
        "valueType": "entity",
        "valueId": "bf061ad5-72e2-4ff2-8c88-4b2411bd616d"
    },
    {
        "id": "0x1A39E2Fe299Ef8f855ce43abF7AC85D6e69E05F5:51661ff1-1f41-4224-a915-452385f238a4:de4a2179-b903-4128-9602-ff3bf5efff97:f2f50c02-7e3c-429c-93b3-85f77381c8a5",
        "attribute": {
            "id": "de4a2179-b903-4128-9602-ff3bf5efff97",
            "name": "Core devs"
        },
        "entity": {
            "id": "51661ff1-1f41-4224-a915-452385f238a4",
            "name": "The Graph"
        },
        "entityValue": {
            "id": "f2f50c02-7e3c-429c-93b3-85f77381c8a5",
            "name": "Pinax"
        },
        "numberValue": null,
        "stringValue": null,
        "valueType": "entity",
        "valueId": "f2f50c02-7e3c-429c-93b3-85f77381c8a5"
    },
    {
        "id": "0x1A39E2Fe299Ef8f855ce43abF7AC85D6e69E05F5:51661ff1-1f41-4224-a915-452385f238a4:Description:2eb0182a-22ba-4a7e-add0-6d2787c6aec5",
        "attribute": {
            "id": "Description",
            "name": "Description"
        },
        "entity": {
            "id": "51661ff1-1f41-4224-a915-452385f238a4",
            "name": "The Graph"
        },
        "entityValue": null,
        "numberValue": null,
        "stringValue": "An indexing protocol for organizing public data and making it easily accessible",
        "valueType": "string",
        "valueId": "2eb0182a-22ba-4a7e-add0-6d2787c6aec5"
    },
    {
        "id": "0x1A39E2Fe299Ef8f855ce43abF7AC85D6e69E05F5:51661ff1-1f41-4224-a915-452385f238a4:e9d2bc8b-0599-46b7-b5a0-7daaabdb94a9:7927188e-e4ea-4f5e-87bc-55a0580f17b5",
        "attribute": {
            "id": "e9d2bc8b-0599-46b7-b5a0-7daaabdb94a9",
            "name": "DAOs"
        },
        "entity": {
            "id": "51661ff1-1f41-4224-a915-452385f238a4",
            "name": "The Graph"
        },
        "entityValue": {
            "id": "7927188e-e4ea-4f5e-87bc-55a0580f17b5",
            "name": "Graph Advocates"
        },
        "numberValue": null,
        "stringValue": null,
        "valueType": "entity",
        "valueId": "7927188e-e4ea-4f5e-87bc-55a0580f17b5"
    },
    {
        "id": "0x1A39E2Fe299Ef8f855ce43abF7AC85D6e69E05F5:51661ff1-1f41-4224-a915-452385f238a4:f724b805-89e1-424b-b149-acff9ecfd0f7:0x1A39E2Fe299Ef8f855ce43abF7AC85D6e69E05F5:51661ff1-1f41-4224-a915-452385f238a4:f724b805-89e1-424b-b149-acff9ecfd0f7:a412f1d8-e54f-435c-9f58-e80d5ddf10f0",
        "attribute": {
            "id": "f724b805-89e1-424b-b149-acff9ecfd0f7",
            "name": "Website"
        },
        "entity": {
            "id": "51661ff1-1f41-4224-a915-452385f238a4",
            "name": "The Graph"
        },
        "entityValue": null,
        "numberValue": null,
        "stringValue": "https://thegraph.com",
        "valueType": "url",
        "valueId": "0x1A39E2Fe299Ef8f855ce43abF7AC85D6e69E05F5:51661ff1-1f41-4224-a915-452385f238a4:f724b805-89e1-424b-b149-acff9ecfd0f7:a412f1d8-e54f-435c-9f58-e80d5ddf10f0"
    },
    {
        "id": "0x1A39E2Fe299Ef8f855ce43abF7AC85D6e69E05F5:51661ff1-1f41-4224-a915-452385f238a4:name:520dbeaf-bd0e-49e6-8c83-10a962f264ec",
        "attribute": {
            "id": "name",
            "name": "Name"
        },
        "entity": {
            "id": "51661ff1-1f41-4224-a915-452385f238a4",
            "name": "The Graph"
        },
        "entityValue": null,
        "numberValue": null,
        "stringValue": "The Graph",
        "valueType": "string",
        "valueId": "520dbeaf-bd0e-49e6-8c83-10a962f264ec"
    },
    {
        "id": "0x1A39E2Fe299Ef8f855ce43abF7AC85D6e69E05F5:51661ff1-1f41-4224-a915-452385f238a4:type:a2270b1f-391e-4137-ae68-e60315a79b99",
        "attribute": {
            "id": "type",
            "name": "Types"
        },
        "entity": {
            "id": "51661ff1-1f41-4224-a915-452385f238a4",
            "name": "The Graph"
        },
        "entityValue": {
            "id": "a2270b1f-391e-4137-ae68-e60315a79b99",
            "name": "Indexing"
        },
        "numberValue": null,
        "stringValue": null,
        "valueType": "entity",
        "valueId": "a2270b1f-391e-4137-ae68-e60315a79b99"
    },
    {
        "id": "0x1A39E2Fe299Ef8f855ce43abF7AC85D6e69E05F5:51661ff1-1f41-4224-a915-452385f238a4:type:cb9d261d-456b-4eaf-87e5-1e9faa441867",
        "attribute": {
            "id": "type",
            "name": "Types"
        },
        "entity": {
            "id": "51661ff1-1f41-4224-a915-452385f238a4",
            "name": "The Graph"
        },
        "entityValue": {
            "id": "cb9d261d-456b-4eaf-87e5-1e9faa441867",
            "name": "Project"
        },
        "numberValue": null,
        "stringValue": null,
        "valueType": "entity",
        "valueId": "cb9d261d-456b-4eaf-87e5-1e9faa441867"
    },
    {
        "id": "0x1A39E2Fe299Ef8f855ce43abF7AC85D6e69E05F5:51661ff1-1f41-4224-a915-452385f238a4:type:e029236d-3650-47b7-98b2-ccb2807d89bb",
        "attribute": {
            "id": "type",
            "name": "Types"
        },
        "entity": {
            "id": "51661ff1-1f41-4224-a915-452385f238a4",
            "name": "The Graph"
        },
        "entityValue": {
            "id": "e029236d-3650-47b7-98b2-ccb2807d89bb",
            "name": "Protocol"
        },
        "numberValue": null,
        "stringValue": null,
        "valueType": "entity",
        "valueId": "e029236d-3650-47b7-98b2-ccb2807d89bb"
    },
    {
        "id": "0x1A39E2Fe299Ef8f855ce43abF7AC85D6e69E05F5:51661ff1-1f41-4224-a915-452385f238a4:type:ea7ad56f-20ce-4bb3-8d23-10cc3318d428",
        "attribute": {
            "id": "type",
            "name": "Types"
        },
        "entity": {
            "id": "51661ff1-1f41-4224-a915-452385f238a4",
            "name": "The Graph"
        },
        "entityValue": {
            "id": "ea7ad56f-20ce-4bb3-8d23-10cc3318d428",
            "name": "API"
        },
        "numberValue": null,
        "stringValue": null,
        "valueType": "entity",
        "valueId": "ea7ad56f-20ce-4bb3-8d23-10cc3318d428"
    },
    {
        "id": "0x1A39E2Fe299Ef8f855ce43abF7AC85D6e69E05F5:51661ff1-1f41-4224-a915-452385f238a4:type:ee89a72f-7c0e-42b7-8f7d-e50c23253724",
        "attribute": {
            "id": "type",
            "name": "Types"
        },
        "entity": {
            "id": "51661ff1-1f41-4224-a915-452385f238a4",
            "name": "The Graph"
        },
        "entityValue": {
            "id": "ee89a72f-7c0e-42b7-8f7d-e50c23253724",
            "name": "Infrastructure"
        },
        "numberValue": null,
        "stringValue": null,
        "valueType": "entity",
        "valueId": "ee89a72f-7c0e-42b7-8f7d-e50c23253724"
    }
]
 */
