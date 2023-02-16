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

Check out `contracts.md` in `/docs` in the root of the repo for more info.
