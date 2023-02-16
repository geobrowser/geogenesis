# Deploy scripts

There are several steps required to deploy contracts for Geo. There are also several _types_ of contracts in Geo.

1. Deploy a beacon proxy. All implementations of a _type_ of contract should point to the same beacon proxy. Proxies for both types of contracts are already deployed so you should not have to do this step on Polygon mainnet.
2. Deploy a space registry. Right now there are two types of Spaces, a `Space` and a `PermissionlessSpace`. Each type has their own space registry. Registries for each type are already deployed so you should not have to do this step on Polygon mainnet. Each contract deployment of a given type should point to the corresponding beacon proxy contract.
3. Deploy a Space. The Space should be deployed and added as a Space Entity in the correct Space Registry. e.g., if you're deploying a `PermissionlessSpace`, it should be added to the `PermissionlessSpace` Registry.

There are scripts that correspond to each of these steps.

### Running a deployment script

```sh
npx hardhat run --network [polygon_mainnet | polygon_mumbai] scripts/deploy-permissionless-space-beacon.ts
```

### How do the contracts interact?

Data in Geo is organized into Spaces. Each Space contains triples representing properties assigned to an Entity.

We index these Spaces using [dynamic data sources in the Geo subgraph](https://thegraph.com/docs/en/developing/creating-a-subgraph/#data-source-templates). The subgraph starts by indexing the ["Root" Space](https://www.geobrowser.io/space/0x170b749413328ac9a94762031a7A05b00c1D2e34?typeId=30659852-2df5-42f6-9ad7-2921c33ad84b). We call a Space that indexes other Spaces a Space Registry. _Note: Since all Space Registries are Spaces, any Space can act as a Space Registry_.

We can then add sub-Spaces as Entities to the Root Space. When the subgraph indexes these sub-Spaces in the Root Space it automatically generates a dynamic data source based on the new space's contract address and begins indexing it.

For permissionless Spaces we do the same thing, but instead add permissionless sub-Spaces to a different Space Registry. This Permissionless Space registry also lives within the Root Space Registry.

### Upgrading contracts

There are currently two types of contracts in Geo: 1) A Space and a 2) Permissionless Space.

Each deployed contract for each type is tied to a [Beacon Proxy](https://docs.openzeppelin.com/contracts/3.x/api/proxy). This allows us to upgrade all implementations of a particular contract at the same time by upgrading the beacon itself.

There's a beacon for all instances of a `Space`, and a beacon for all instances of a `PermissionlessSpace`.

[Read more about proxy upgrades here](https://docs.openzeppelin.com/upgrades-plugins/1.x/proxies)
